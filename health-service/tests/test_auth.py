from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_open_when_no_key_configured(monkeypatch):
    monkeypatch.delenv("HEALTH_API_KEY", raising=False)
    assert client.post("/demo/analyze", json={"asset_id": "a", "severity": 0.1}).status_code == 200


def test_key_required_when_configured(monkeypatch):
    monkeypatch.setenv("HEALTH_API_KEY", "s3cret")
    body = {"asset_id": "a", "severity": 0.1}
    assert client.post("/demo/analyze", json=body).status_code == 401
    assert client.post("/demo/analyze", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post("/demo/analyze", json=body, headers={"X-API-Key": "s3cret"}).status_code == 200


def test_healthz_stays_public(monkeypatch):
    monkeypatch.setenv("HEALTH_API_KEY", "s3cret")
    assert client.get("/healthz").status_code == 200
