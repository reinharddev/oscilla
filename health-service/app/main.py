"""Oscilla health service.

Stateless feature extraction and scoring over HTTP. Baselines are kept in memory for
now; the web app will persist them in the database.
"""
from __future__ import annotations

import hmac
import os
import threading

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .features import extract_features
from .scoring import MODEL_VERSION, Baseline, score_window
from .signals import generate_vibration

app = FastAPI(title="Oscilla Health Service", version="0.1.0")
_baselines: dict[str, Baseline] = {}
_lock = threading.Lock()


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    """When HEALTH_API_KEY is set, every route except /healthz needs a matching X-API-Key."""
    expected = os.environ.get("HEALTH_API_KEY")
    if expected and not (x_api_key and hmac.compare_digest(x_api_key, expected)):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


class BaselineRequest(BaseModel):
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    windows: list[list[float]] = Field(..., min_length=5)


class AnalyzeRequest(BaseModel):
    asset_id: str
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    signal: list[float] = Field(..., min_length=1_000)


class DemoAnalyzeRequest(BaseModel):
    asset_id: str
    severity: float = Field(0.0, ge=0.0, le=1.0)
    rpm: float = Field(1800.0, gt=0)
    fs: int = Field(12_000, ge=1_000)
    seed: int | None = None


class SimulateRequest(BaseModel):
    severity: float = Field(0.0, ge=0.0, le=1.0)
    fs: int = Field(12_000, ge=1_000)
    duration: float = Field(1.0, gt=0, le=10)
    rpm: float = Field(1800.0, gt=0)
    seed: int | None = None


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "baselines": len(_baselines)}


@app.post("/simulate", dependencies=[Depends(require_key)])
def simulate(req: SimulateRequest) -> dict:
    x = generate_vibration(req.fs, req.duration, req.rpm, req.severity, req.seed)
    return {"fs": req.fs, "rpm": req.rpm, "severity": req.severity, "signal": x.round(5).tolist()}


@app.post("/baselines/{asset_id}", dependencies=[Depends(require_key)])
def fit_baseline(asset_id: str, req: BaselineRequest) -> dict:
    try:
        feats = [extract_features(np.asarray(w), req.fs, req.rpm) for w in req.windows]
        _baselines[asset_id] = Baseline.fit(feats)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"asset_id": asset_id, "windows": len(feats)}


@app.post("/analyze", dependencies=[Depends(require_key)])
def analyze(req: AnalyzeRequest) -> dict:
    baseline = _baselines.get(req.asset_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail=f"no baseline for asset {req.asset_id}")
    feats = extract_features(np.asarray(req.signal), req.fs, req.rpm)
    return {"asset_id": req.asset_id, "model_version": MODEL_VERSION, "features": {k: round(v, 5) for k, v in feats.items()}, **score_window(baseline, feats)}


def _demo_baseline(asset_id: str, fs: int, rpm: float) -> Baseline:
    """Learn a healthy baseline for one simulated machine the first time it is seen."""
    key = f"{asset_id}@{rpm:g}"
    with _lock:
        if key not in _baselines:
            windows = [extract_features(generate_vibration(fs, 1.0, rpm, 0.0, seed=i), fs, rpm) for i in range(30)]
            _baselines[key] = Baseline.fit(windows)
        return _baselines[key]


@app.post("/demo/analyze", dependencies=[Depends(require_key)])
def demo_analyze(req: DemoAnalyzeRequest) -> dict:
    """Simulated sensor + real pipeline.

    The vibration window is generated here from the machine's damage level, then goes through
    exactly the same feature extraction and scoring as a recorded signal would.
    """
    baseline = _demo_baseline(req.asset_id, req.fs, req.rpm)
    x = generate_vibration(req.fs, 1.0, req.rpm, req.severity, req.seed)
    feats = extract_features(x, req.fs, req.rpm)
    return {
        "asset_id": req.asset_id,
        "source": "simulated sensor",
        "model_version": MODEL_VERSION,
        "features": {k: round(v, 5) for k, v in feats.items()},
        **score_window(baseline, feats),
    }
