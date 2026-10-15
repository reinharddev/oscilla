"""Health score, evidence and remaining-life estimate.

v0 is a statistical baseline detector, not a trained neural network: it learns what a
healthy machine looks like (mean and spread of each feature) and scores how far a new
window departs from that. It is deliberately simple and explainable. The learned model
(PyTorch on ROCm) will replace the scoring step and keep the same inputs and outputs.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .features import FEATURE_LABELS, FEATURE_NAMES, feature_vector

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

    @classmethod
    def fit(cls, windows: list[dict[str, float]]) -> "Baseline":
        if len(windows) < 5:
            raise ValueError("need at least 5 healthy windows to learn a baseline")
        m = np.stack([feature_vector(w) for w in windows])
        mean = m.mean(axis=0)
        std = m.std(axis=0, ddof=1)
        # Floor the spread so a very stable feature does not explode into huge z-scores.
        std = np.maximum(std, 0.05 * np.abs(mean) + 1e-6)
        return cls(mean=mean, std=std, n_windows=len(windows))


    def to_payload(self) -> dict:
        return {"feature_names": FEATURE_NAMES, "mean": [float(x) for x in self.mean], "std": [float(x) for x in self.std], "n_windows": self.n_windows}

    @classmethod
    def from_payload(cls, p: dict) -> "Baseline":
        if list(p["feature_names"]) != list(FEATURE_NAMES):
            raise ValueError("baseline was learned with a different feature set; re-learn it")
        if len(p["mean"]) != len(FEATURE_NAMES) or len(p["std"]) != len(FEATURE_NAMES):
            raise ValueError("baseline has the wrong length")
        return cls(mean=np.asarray(p["mean"], dtype=float), std=np.asarray(p["std"], dtype=float), n_windows=int(p["n_windows"]))


def status_of(score: float) -> str:
    return "healthy" if score >= 75 else "attention" if score >= 50 else "critical"


def score_window(baseline: Baseline, feats: dict[str, float], top_k: int = 3) -> dict:
    z = (feature_vector(feats) - baseline.mean) / baseline.std
    d = float(np.sqrt(np.mean(np.log1p(np.clip(z, 0, None)) ** 2)))
    score = float(100.0 / (1.0 + (d / D50) ** SHARPNESS))
    order = np.argsort(-z)[:top_k]
    evidence = [
        {
            "feature": FEATURE_NAMES[i],
            "label": FEATURE_LABELS[FEATURE_NAMES[i]],
            "value": round(float(feature_vector(feats)[i]), 4),
            "baseline": round(float(baseline.mean[i]), 4),
            "z_score": round(float(z[i]), 2),
        }
        for i in order
        if z[i] > 2.0
    ]
    return {"score": round(score, 1), "status": status_of(score), "deviation": round(d, 2), "evidence": evidence}


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
