"""Health score, evidence and remaining-life estimate.

v0 is a statistical baseline detector, not a trained neural network: it learns what a
healthy machine looks like (mean and spread of each feature) and scores how far a new
window departs from that. It is deliberately simple and explainable. The learned model
(PyTorch on ROCm) will replace the scoring step and keep the same inputs and outputs.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .features import FAULT_FEATURES, FEATURE_LABELS, FEATURE_NAMES

# Deviation is measured on a log scale so one extreme feature cannot dominate, and the
# score then falls smoothly as damage grows. D50 is the deviation that maps to a score of
# 50; the exponent sets how sharply it falls. Tuned on synthetic windows (see tests).
MODEL_VERSION = "baseline-v0"
D50 = 1.8
SHARPNESS = 3


@dataclass
class Baseline:
    mean: np.ndarray
    std: np.ndarray
    n_windows: int
    # Features the baseline was learned on. A baseline stored before a feature was added keeps
    # scoring on the features it knows; re-learning picks up the new ones.
    names: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.names is None:
            self.names = list(FEATURE_NAMES)

    @classmethod
    def fit(cls, windows: list[dict[str, float]]) -> "Baseline":
        if len(windows) < 5:
            raise ValueError("need at least 5 healthy windows to learn a baseline")
        m = np.stack([[w[n] for n in FEATURE_NAMES] for w in windows])
        mean = m.mean(axis=0)
        std = m.std(axis=0, ddof=1)
        # Floor the spread so a very stable feature does not explode into huge z-scores.
        std = np.maximum(std, 0.05 * np.abs(mean) + 1e-6)
        return cls(mean=mean, std=std, n_windows=len(windows), names=list(FEATURE_NAMES))

    def to_payload(self) -> dict:
        return {"feature_names": list(self.names), "mean": [float(x) for x in self.mean], "std": [float(x) for x in self.std], "n_windows": self.n_windows}

    @classmethod
    def from_payload(cls, p: dict) -> "Baseline":
        names = list(p["feature_names"])
        unknown = [n for n in names if n not in FEATURE_NAMES]
        if unknown or not names:
            raise ValueError(f"baseline uses unknown features {unknown}; re-learn it")
        if len(p["mean"]) != len(names) or len(p["std"]) != len(names):
            raise ValueError("baseline has the wrong length")
        return cls(mean=np.asarray(p["mean"], dtype=float), std=np.asarray(p["std"], dtype=float), n_windows=int(p["n_windows"]), names=names)


def status_of(score: float) -> str:
    return "healthy" if score >= 75 else "attention" if score >= 50 else "critical"


# A defect frequency is only named when its envelope peak is clearly above the noise floor
# (PEAK_MIN times the median level) and clearly ahead of the other defect frequencies. Ball and
# inner-race faults can excite each other's frequencies, so an unclear window stays unnamed.
# The threshold was set after looking at the CWRU recordings: treat its accuracy as optimistic.
PEAK_MIN = 10.0
LEAD_MIN = 1.5


def _fault_type(names: list[str], values: np.ndarray, z: np.ndarray) -> str | None:
    found = sorted(
        ((float(values[i]), FAULT_FEATURES[n]) for i, n in enumerate(names) if n in FAULT_FEATURES and z[i] > 4.0),
        reverse=True,
    )
    if not found or found[0][0] < PEAK_MIN:
        return None
    if len(found) > 1 and found[0][0] < LEAD_MIN * found[1][0]:
        return None
    return found[0][1]


def score_window(baseline: Baseline, feats: dict[str, float], top_k: int = 3) -> dict:
    values = np.array([feats[n] for n in baseline.names], dtype=float)
    z = (values - baseline.mean) / baseline.std
    d = float(np.sqrt(np.mean(np.log1p(np.clip(z, 0, None)) ** 2)))
    score = float(100.0 / (1.0 + (d / D50) ** SHARPNESS))
    order = np.argsort(-z)[:top_k]
    evidence = [
        {
            "feature": baseline.names[i],
            "label": FEATURE_LABELS[baseline.names[i]],
            "value": round(float(values[i]), 4),
            "baseline": round(float(baseline.mean[i]), 4),
            "z_score": round(float(z[i]), 2),
        }
        for i in order
        if z[i] > 2.0
    ]
    fault_type = _fault_type(baseline.names, values, z)
    return {"score": round(score, 1), "status": status_of(score), "deviation": round(d, 2), "evidence": evidence, "fault_type": fault_type}


def estimate_rul_days(times_days: list[float], scores: list[float], fail_score: float = 25.0) -> float | None:
    """Linear trend of recent scores extrapolated to the failure threshold.

    Returns None when the trend is flat or improving (no failure in sight).
    """
    if len(times_days) < 4:
        return None
    t = np.asarray(times_days, dtype=float)
    s = np.asarray(scores, dtype=float)
    slope, intercept = np.polyfit(t, s, 1)
    if slope >= -1e-6:
        return None
    t_fail = (fail_score - intercept) / slope
    return max(0.0, float(t_fail - t[-1]))
