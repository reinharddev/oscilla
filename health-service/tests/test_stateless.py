"""The stateless endpoints: the caller owns the baseline and sends it with each request."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
RPM = 1800


def _baseline(asset="m-1"):
    r = client.post("/demo/baseline", json={"asset_id": asset, "rpm": RPM})
    assert r.status_code == 200
    return r.json()


def test_baseline_is_deterministic_per_machine_and_complete():
    a, b = _baseline("m-1"), _baseline("m-1")
    assert a == b
    assert a["n_windows"] == 30 and len(a["mean"]) == len(a["std"]) == len(a["feature_names"])
    assert _baseline("m-2")["mean"] != a["mean"]


def test_demo_score_falls_with_damage_and_reports_aux_channels():
    base = _baseline()
    ok = client.post("/demo/score", json={"asset_id": "m-1", "severity": 0.0, "rpm": RPM, "seed": 3, "baseline": base}).json()
    bad = client.post("/demo/score", json={"asset_id": "m-1", "severity": 0.8, "rpm": RPM, "seed": 3, "baseline": base}).json()
    assert ok["score"] > 75 > 50 > bad["score"]
    assert bad["aux"]["vibration_mm_s"] > ok["aux"]["vibration_mm_s"]
    assert set(bad["aux"]) == {"vibration_mm_s", "temperature_c", "current_a"}


def test_recorded_window_scores_against_a_supplied_baseline():
    base = _baseline()
    sig = client.post("/simulate", json={"severity": 0.7, "rpm": RPM, "seed": 9}).json()["signal"]
    res = client.post("/score", json={"rpm": RPM, "signal": sig, "baseline": base}).json()
    assert res["status"] != "healthy" and res["evidence"]


def test_baseline_can_be_learned_from_recorded_healthy_windows():
    wins = [client.post("/simulate", json={"severity": 0.0, "rpm": RPM, "seed": i}).json()["signal"] for i in range(6)]
    payload = client.post("/baseline/fit", json={"rpm": RPM, "windows": wins}).json()
    assert payload["n_windows"] == 6


def test_baseline_with_a_different_feature_set_is_rejected():
    base = _baseline()
    base["feature_names"] = base["feature_names"][:-1] + ["something_else"]
    r = client.post("/demo/score", json={"asset_id": "m-1", "severity": 0.1, "rpm": RPM, "baseline": base})
    assert r.status_code == 422


def test_series_returns_one_point_per_severity_in_order():
    base = _baseline()
    sev = [0.0, 0.2, 0.5, 0.8]
    pts = client.post("/demo/series", json={"asset_id": "m-1", "severities": sev, "rpm": RPM, "baseline": base}).json()["points"]
    assert len(pts) == 4
    scores = [p["score"] for p in pts]
    assert scores[0] > scores[-1]


def test_series_rejects_out_of_range_severity():
    base = _baseline()
    r = client.post("/demo/series", json={"asset_id": "m-1", "severities": [0.1, 1.4], "rpm": RPM, "baseline": base})
    assert r.status_code == 422


def test_healthz_answers_head_for_uptime_monitors():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    assert c.head("/healthz").status_code == 200
    assert c.get("/healthz").json()["status"] == "ok"
