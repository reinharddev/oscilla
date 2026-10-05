import numpy as np
import pytest

from app.features import FEATURE_NAMES, extract_features
from app.scoring import Baseline, estimate_rul_days, score_window, status_of
from app.signals import generate_vibration

FS, RPM = 12_000, 1800.0


def feats(severity: float, seed: int) -> dict:
    return extract_features(generate_vibration(FS, 1.0, RPM, severity, seed), FS, RPM)


@pytest.fixture(scope="module")
def baseline() -> Baseline:
    return Baseline.fit([feats(0.0, s) for s in range(30)])


def test_signal_is_reproducible_and_validated():
    a = generate_vibration(FS, 1.0, RPM, 0.4, seed=7)
    b = generate_vibration(FS, 1.0, RPM, 0.4, seed=7)
    assert np.array_equal(a, b)
    assert a.size == FS
    with pytest.raises(ValueError):
        generate_vibration(severity=1.5)


def test_features_have_all_names_and_finite_values():
    f = feats(0.5, 1)
    assert set(f) == set(FEATURE_NAMES)
    assert all(np.isfinite(v) for v in f.values())


def test_fault_raises_the_bearing_specific_features():
    healthy = np.mean([feats(0.0, s)["bpfo_envelope_ratio"] for s in range(10)])
    faulty = np.mean([feats(0.6, 100 + s)["bpfo_envelope_ratio"] for s in range(10)])
    assert faulty > 5 * healthy
    assert feats(0.6, 1)["crest_factor"] > feats(0.0, 1)["crest_factor"]
    assert feats(0.6, 1)["rms"] > feats(0.0, 1)["rms"]


def test_healthy_windows_not_flagged(baseline):
    scores = [score_window(baseline, feats(0.0, 500 + s))["score"] for s in range(20)]
    assert min(scores) >= 85
    assert all(status_of(s) == "healthy" for s in scores)


def test_score_falls_as_damage_grows(baseline):
    means = []
    for sev in [0.0, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0]:
        means.append(np.mean([score_window(baseline, feats(sev, 900 + s))["score"] for s in range(8)]))
    assert all(a > b for a, b in zip(means, means[1:])), means
    assert means[0] > 95 and means[-1] < 35


def test_status_thresholds_match_the_app():
    assert status_of(75) == "healthy"
    assert status_of(74.9) == "attention"
    assert status_of(50) == "attention"
    assert status_of(49.9) == "critical"


def test_evidence_points_at_the_defect_frequency(baseline):
    out = score_window(baseline, feats(0.6, 42))
    assert out["status"] in {"attention", "critical"}
    names = [e["feature"] for e in out["evidence"]]
    assert "bpfo_envelope_ratio" in names
    assert all(e["z_score"] > 2 for e in out["evidence"])


def test_healthy_window_has_no_evidence(baseline):
    assert score_window(baseline, feats(0.0, 777))["evidence"] == []


def test_baseline_needs_enough_windows():
    with pytest.raises(ValueError):
        Baseline.fit([feats(0.0, s) for s in range(3)])


def test_rul_from_declining_trend():
    days = list(range(0, 10))
    scores = [100 - 6 * d for d in days]  # reaches 25 at day 12.5
    rul = estimate_rul_days(days, scores)
    assert rul == pytest.approx(3.5, abs=0.2)


def test_rul_none_when_not_declining():
    assert estimate_rul_days([0, 1, 2, 3, 4], [95, 96, 95, 96, 97]) is None
    assert estimate_rul_days([0, 1], [90, 80]) is None
