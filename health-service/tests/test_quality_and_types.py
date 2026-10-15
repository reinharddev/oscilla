import numpy as np
from fastapi.testclient import TestClient

from app.features import FEATURE_NAMES, extract_features, window_quality
from app.main import app
from app.scoring import Baseline, score_window
from app.signals import generate_vibration

FS, RPM = 12_000, 1800.0
client = TestClient(app)


def healthy_baseline() -> Baseline:
    return Baseline.fit([extract_features(generate_vibration(FS, 1.0, RPM, 0.0, seed=i), FS, RPM) for i in range(20)])


def test_window_quality_flags_dead_and_saturated_sensors():
    ok = generate_vibration(FS, 1.0, RPM, 0.0, seed=1)
    assert window_quality(ok, FS) == {"ok": True, "issues": []}
    assert window_quality(np.zeros(FS), FS)["issues"] == ["flatline"]
    assert window_quality(np.full(FS, 0.3), FS)["issues"] == ["flatline"]
    clipped = np.clip(ok, -0.2 * np.abs(ok).max(), 0.2 * np.abs(ok).max())
    assert "clipping" in window_quality(clipped, FS)["issues"]
    dropout = ok.copy()
    dropout[2000:4500] = 0.0
    assert "dropout" in window_quality(dropout, FS)["issues"]


def test_score_endpoint_rejects_untrustworthy_window_instead_of_calling_it_healthy():
    payload = healthy_baseline().to_payload()
    r = client.post("/score", json={"fs": FS, "rpm": RPM, "signal": [0.0] * FS, "baseline": payload})
    assert r.status_code == 200
    body = r.json()
    assert body["rejected"] is True and body["issues"] == ["flatline"]
    assert "score" not in body


def test_baseline_learned_before_new_features_still_scores():
    base = healthy_baseline().to_payload()
    keep = [i for i, n in enumerate(base["feature_names"]) if n not in ("bpfi_envelope_ratio", "ball_envelope_ratio")]
    old = {**base, "feature_names": [base["feature_names"][i] for i in keep], "mean": [base["mean"][i] for i in keep], "std": [base["std"][i] for i in keep]}
    b = Baseline.from_payload(old)
    out = score_window(b, extract_features(generate_vibration(FS, 1.0, RPM, 0.7, seed=3), FS, RPM))
    assert out["score"] < 50
    assert b.to_payload()["feature_names"] == old["feature_names"]


def test_fault_type_is_named_only_when_clear():
    b = healthy_baseline()
    severe = score_window(b, extract_features(generate_vibration(FS, 1.0, RPM, 0.8, seed=5), FS, RPM))
    assert severe["fault_type"] == "outer_race"
    healthy = score_window(b, extract_features(generate_vibration(FS, 1.0, RPM, 0.0, seed=99), FS, RPM))
    assert healthy["fault_type"] is None
    assert any("outer-race" in e["label"] for e in severe["evidence"])


def test_unknown_feature_names_are_refused():
    base = healthy_baseline().to_payload()
    base["feature_names"][0] = "made_up"
    r = client.post("/score", json={"fs": FS, "rpm": RPM, "signal": [0.1] * 2000, "baseline": base})
    assert r.status_code == 422
    assert set(FEATURE_NAMES) >= set(healthy_baseline().names)
