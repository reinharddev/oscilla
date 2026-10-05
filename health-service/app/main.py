"""Oscilla health service.

Stateless feature extraction and scoring over HTTP. Baselines are kept in memory for
now; the web app will persist them in the database.
"""
from __future__ import annotations

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .features import extract_features
from .scoring import Baseline, score_window
from .signals import generate_vibration

app = FastAPI(title="Oscilla Health Service", version="0.1.0")
_baselines: dict[str, Baseline] = {}


class BaselineRequest(BaseModel):
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    windows: list[list[float]] = Field(..., min_length=5)


class AnalyzeRequest(BaseModel):
    asset_id: str
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    signal: list[float] = Field(..., min_length=1_000)


class SimulateRequest(BaseModel):
    severity: float = Field(0.0, ge=0.0, le=1.0)
    fs: int = Field(12_000, ge=1_000)
    duration: float = Field(1.0, gt=0, le=10)
    rpm: float = Field(1800.0, gt=0)
    seed: int | None = None


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "baselines": len(_baselines)}


@app.post("/simulate")
def simulate(req: SimulateRequest) -> dict:
    x = generate_vibration(req.fs, req.duration, req.rpm, req.severity, req.seed)
    return {"fs": req.fs, "rpm": req.rpm, "severity": req.severity, "signal": x.round(5).tolist()}


@app.post("/baselines/{asset_id}")
def fit_baseline(asset_id: str, req: BaselineRequest) -> dict:
    try:
        feats = [extract_features(np.asarray(w), req.fs, req.rpm) for w in req.windows]
        _baselines[asset_id] = Baseline.fit(feats)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"asset_id": asset_id, "windows": len(feats)}


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    baseline = _baselines.get(req.asset_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail=f"no baseline for asset {req.asset_id}")
    feats = extract_features(np.asarray(req.signal), req.fs, req.rpm)
    return {"asset_id": req.asset_id, "features": {k: round(v, 5) for k, v in feats.items()}, **score_window(baseline, feats)}
