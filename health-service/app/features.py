"""Turn one raw vibration window into a small vector of interpretable features."""
from __future__ import annotations

import numpy as np
from scipy import signal as sps
from scipy import stats

from .signals import bpfi_hz, bpfo_hz, bsf_hz

# Frequency bands in Hz. The 2-4 kHz band is where a bearing impact rings.
BANDS = [(0, 200), (200, 1000), (1000, 2000), (2000, 4000), (4000, 6000)]

FEATURE_NAMES = [
    "rms",
    "peak",
    "crest_factor",
    "kurtosis",
    "skewness",
    *[f"band_{lo}_{hi}_db" for lo, hi in BANDS],
    "bpfo_envelope_ratio",
    "bpfi_envelope_ratio",
    "ball_envelope_ratio",
]

# Which envelope feature points at which defect.
FAULT_FEATURES = {
    "bpfo_envelope_ratio": "outer_race",
    "bpfi_envelope_ratio": "inner_race",
    "ball_envelope_ratio": "ball",
}

# Plain-language labels used when the system explains a score.
FEATURE_LABELS = {
    "rms": "Overall vibration level (RMS)",
    "peak": "Peak amplitude",
    "crest_factor": "Crest factor (peak vs RMS)",
    "kurtosis": "Kurtosis (sharp spikes)",
    "skewness": "Skewness",
    "bpfo_envelope_ratio": "Energy at the outer-race defect frequency",
    "bpfi_envelope_ratio": "Energy at the inner-race defect frequency",
    "ball_envelope_ratio": "Energy at the rolling-element defect frequency",
    **{f"band_{lo}_{hi}_db": f"Energy {lo}-{hi} Hz" for lo, hi in BANDS},
}


def _band_energy_db(freqs: np.ndarray, power: np.ndarray, lo: float, hi: float) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    return float(10 * np.log10(power[mask].sum() + 1e-12))


def _envelope_ratios(x: np.ndarray, fs: int, rpm: float) -> dict[str, float]:
    """Envelope-spectrum peak at each bearing defect frequency, relative to its median level.

    Band-pass around the structural resonance, take the Hilbert envelope, then look for a
    peak at the outer-race, inner-race and rolling-element defect frequencies. A healthy
    bearing has no such peak (ratios near 1). A rolling-element fault shows up at the ball
    spin frequency or its second harmonic, so the larger of the two is used.
    """
    nyq = fs / 2
    lo, hi = 2000 / nyq, min(4000, nyq * 0.95) / nyq
    b, a = sps.butter(4, [lo, hi], btype="band")
    env = np.abs(sps.hilbert(sps.filtfilt(b, a, x)))
    env = env - env.mean()
    spec = np.abs(np.fft.rfft(env * np.hanning(env.size)))
    freqs = np.fft.rfftfreq(env.size, 1 / fs)
    ref = (freqs > 10) & (freqs < 500)
    floor = np.median(spec[ref]) + 1e-12

    def peak(target: float) -> float:
        near = (freqs > target * 0.97) & (freqs < target * 1.03)
        return float(spec[near].max() / floor) if near.any() else 1.0

    return {
        "bpfo_envelope_ratio": peak(bpfo_hz(rpm)),
        "bpfi_envelope_ratio": peak(bpfi_hz(rpm)),
        "ball_envelope_ratio": max(peak(bsf_hz(rpm)), peak(2 * bsf_hz(rpm))),
    }


def window_quality(x: np.ndarray, fs: int) -> dict:
    """Is this window trustworthy enough to score? A dead or saturated sensor must not look healthy.

    Issues: flatline (no variation), clipping (a plateau at the extremes) and dropout (a long
    run of exact zeros).
    """
    x = np.asarray(x, dtype=float)
    issues: list[str] = []
    span = float(np.ptp(x))
    if span <= 1e-9 or float(np.std(x)) <= 1e-9:
        issues.append("flatline")
    else:
        top = np.isclose(x, x.max(), rtol=0, atol=span * 1e-6).mean()
        bottom = np.isclose(x, x.min(), rtol=0, atol=span * 1e-6).mean()
        if top + bottom > 0.01:
            issues.append("clipping")
        zero = x == 0.0
        if zero.any():
            # longest run of consecutive zeros
            edges = np.diff(np.concatenate(([0], zero.view(np.int8), [0])))
            starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
            if (ends - starts).max() > 0.05 * x.size:
                issues.append("dropout")
    return {"ok": not issues, "issues": issues}


def extract_features(x: np.ndarray, fs: int, rpm: float) -> dict[str, float]:
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    rms = float(np.sqrt(np.mean(x**2)))
    peak = float(np.max(np.abs(x)))
    freqs = np.fft.rfftfreq(x.size, 1 / fs)
    power = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2 / x.size
    feats = {
        "rms": rms,
        "peak": peak,
        "crest_factor": peak / (rms + 1e-12),
        "kurtosis": float(stats.kurtosis(x, fisher=False)),
        "skewness": float(stats.skew(x)),
    }
    for lo, hi in BANDS:
        feats[f"band_{lo}_{hi}_db"] = _band_energy_db(freqs, power, lo, min(hi, fs / 2))
    feats.update(_envelope_ratios(x, fs, rpm))
    return feats


def feature_vector(feats: dict[str, float]) -> np.ndarray:
    return np.array([feats[name] for name in FEATURE_NAMES], dtype=float)
