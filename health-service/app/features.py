"""Turn one raw vibration window into a small vector of interpretable features."""
from __future__ import annotations

import numpy as np
from scipy import signal as sps
from scipy import stats

from .signals import bpfo_hz

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
]

# Plain-language labels used when the system explains a score.
FEATURE_LABELS = {
    "rms": "Overall vibration level (RMS)",
    "peak": "Peak amplitude",
    "crest_factor": "Crest factor (peak vs RMS)",
    "kurtosis": "Kurtosis (sharp spikes)",
    "skewness": "Skewness",
    "bpfo_envelope_ratio": "Energy at the bearing defect frequency",
    **{f"band_{lo}_{hi}_db": f"Energy {lo}-{hi} Hz" for lo, hi in BANDS},
}


def _band_energy_db(freqs: np.ndarray, power: np.ndarray, lo: float, hi: float) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    return float(10 * np.log10(power[mask].sum() + 1e-12))


def _envelope_ratio(x: np.ndarray, fs: int, rpm: float) -> float:
    """Amplitude of the envelope spectrum at BPFO relative to its median level.

    Band-pass around the structural resonance, take the Hilbert envelope, then look for
    a peak at the defect frequency. A healthy bearing has no such peak (ratio near 1).
    """
    nyq = fs / 2
    lo, hi = 2000 / nyq, min(4000, nyq * 0.95) / nyq
    b, a = sps.butter(4, [lo, hi], btype="band")
    env = np.abs(sps.hilbert(sps.filtfilt(b, a, x)))
    env = env - env.mean()
    spec = np.abs(np.fft.rfft(env * np.hanning(env.size)))
    freqs = np.fft.rfftfreq(env.size, 1 / fs)
    target = bpfo_hz(rpm)
    near = (freqs > target * 0.97) & (freqs < target * 1.03)
    ref = (freqs > 10) & (freqs < 500)
    return float(spec[near].max() / (np.median(spec[ref]) + 1e-12))


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
    feats["bpfo_envelope_ratio"] = _envelope_ratio(x, fs, rpm)
    return feats


def feature_vector(feats: dict[str, float]) -> np.ndarray:
    return np.array([feats[name] for name in FEATURE_NAMES], dtype=float)
