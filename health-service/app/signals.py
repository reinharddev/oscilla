"""Synthetic vibration signals for a rolling-element bearing.

Healthy machine: shaft harmonics + broadband noise.
Faulty bearing: the healthy signal plus a train of short impacts at the outer-race
defect frequency (BPFO). Each impact rings a structural resonance that decays fast.
This is the textbook signature used in condition-monitoring literature; it lets the
feature pipeline be exercised end to end without hardware. Real recordings (public
bearing datasets) go through exactly the same feature code.
"""
from __future__ import annotations

import numpy as np

# Outer-race defect frequency as a multiple of shaft frequency (typical 6205-type bearing).
BPFO_ORDER = 3.585
RESONANCE_HZ = 3000.0
DECAY_S = 0.0008


def shaft_hz(rpm: float) -> float:
    return rpm / 60.0


def bpfo_hz(rpm: float) -> float:
    return BPFO_ORDER * shaft_hz(rpm)


def generate_vibration(
    fs: int = 12_000,
    duration: float = 1.0,
    rpm: float = 1800.0,
    severity: float = 0.0,
    seed: int | None = None,
) -> np.ndarray:
    """Return one window of acceleration-like samples.

    severity 0.0 = healthy, 1.0 = severely worn bearing.
    """
    if not 0.0 <= severity <= 1.0:
        raise ValueError("severity must be between 0 and 1")
    rng = np.random.default_rng(seed)
    n = int(fs * duration)
    t = np.arange(n) / fs
    fr = shaft_hz(rpm)

    # Shaft harmonics (imbalance / misalignment content) with a random phase per window.
    phases = rng.uniform(0, 2 * np.pi, 3)
    x = (
        0.60 * np.sin(2 * np.pi * fr * t + phases[0])
        + 0.25 * np.sin(2 * np.pi * 2 * fr * t + phases[1])
        + 0.10 * np.sin(2 * np.pi * 3 * fr * t + phases[2])
    )
    # Wear raises the harmonic content a little and the noise floor too.
    x *= 1.0 + 0.5 * severity
    x += rng.normal(0.0, 0.18 * (1.0 + 0.6 * severity), n)

    if severity > 0.0:
        f_def = bpfo_hz(rpm)
        period = fs / f_def
        kernel_t = np.arange(int(0.006 * fs)) / fs
        kernel = np.exp(-kernel_t / DECAY_S) * np.sin(2 * np.pi * RESONANCE_HZ * kernel_t)
        amp = 2.8 * severity
        k = 0
        while True:
            pos = (k + rng.uniform(-0.01, 0.01)) * period  # small timing jitter
            i = int(round(pos))
            if i >= n:
                break
            if i >= 0:
                end = min(n, i + kernel.size)
                x[i:end] += amp * rng.uniform(0.8, 1.2) * kernel[: end - i]
            k += 1
    return x
