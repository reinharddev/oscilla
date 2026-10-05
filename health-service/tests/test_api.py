from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def sim(severity: float, seed: int) -> list[float]:
    r = client.post("/simulate", json={"severity": severity, "seed": seed})
    assert r.status_code == 200
    return r.json()["signal"]


def test_healthz():
    assert client.get("/healthz").json()["status"] == "ok"


def test_full_flow_baseline_then_analyze():
    windows = [sim(0.0, s) for s in range(10)]
    r = client.post("/baselines/fk-test", json={"windows": windows})
    assert r.status_code == 200 and r.json()["windows"] == 10

    ok = client.post("/analyze", json={"asset_id": "fk-test", "signal": sim(0.0, 99)}).json()
    assert ok["status"] == "healthy" and ok["score"] >= 85

    bad = client.post("/analyze", json={"asset_id": "fk-test", "signal": sim(0.6, 99)}).json()
    assert bad["status"] in {"attention", "critical"}
    assert bad["score"] < ok["score"]
    assert bad["evidence"] and "features" in bad


def test_unknown_asset_is_404():
    r = client.post("/analyze", json={"asset_id": "nope", "signal": [0.0] * 2000})
    assert r.status_code == 404


def test_too_few_baseline_windows_rejected():
    r = client.post("/baselines/x", json={"windows": [[0.0] * 2000] * 2})
    assert r.status_code == 422


def test_simulate_validates_severity():
    assert client.post("/simulate", json={"severity": 2}).status_code == 422
