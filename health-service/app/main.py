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

from .features import extract_features, window_quality
from .scoring import MODEL_VERSION, Baseline, score_window
from .signals import aux_channels, generate_vibration

def hash_seed(text: str) -> int:
    """Stable (process independent) integer seed from a string."""
    h = 2166136261
    for ch in text.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


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


# HEAD too: uptime monitors probe with HEAD.
@app.api_route("/healthz", methods=["GET", "HEAD"])
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


# ---------------------------------------------------------------------------------------
# Stateless scoring: the caller keeps the baseline (the web app stores it per machine in its
# database) and sends it with every request, so this service can restart or scale freely.
# ---------------------------------------------------------------------------------------

class BaselinePayload(BaseModel):
    feature_names: list[str]
    mean: list[float]
    std: list[float]
    n_windows: int = Field(..., ge=1)


def _baseline(p: BaselinePayload) -> Baseline:
    try:
        return Baseline.from_payload(p.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


class FitRequest(BaseModel):
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    windows: list[list[float]] = Field(..., min_length=5, max_length=200)


class ScoreRequest(BaseModel):
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    signal: list[float] = Field(..., min_length=1_000, max_length=200_000)
    baseline: BaselinePayload


class DemoBaselineRequest(BaseModel):
    asset_id: str
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)


class DemoScoreRequest(BaseModel):
    asset_id: str
    severity: float = Field(0.0, ge=0.0, le=1.0)
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    seed: int | None = None
    baseline: BaselinePayload


class DemoSeriesRequest(BaseModel):
    asset_id: str
    severities: list[float] = Field(..., min_length=1, max_length=1000)
    fs: int = Field(12_000, ge=1_000)
    rpm: float = Field(1800.0, gt=0)
    seed: int = 0
    baseline: BaselinePayload


def _result(x: np.ndarray, fs: int, rpm: float, baseline: Baseline, severity: float | None = None, seed: int | None = None) -> dict:
    feats = extract_features(x, fs, rpm)
    out = {"model_version": MODEL_VERSION, "features": {k: round(v, 5) for k, v in feats.items()}, **score_window(baseline, feats)}
    if severity is not None:
        out["aux"] = aux_channels(severity, np.random.default_rng(None if seed is None else seed + 7919))
    return out


@app.post("/baseline/fit", dependencies=[Depends(require_key)])
def baseline_fit(req: FitRequest) -> dict:
    """Learn a healthy baseline from windows recorded while the machine was known to be healthy."""
    try:
        feats = [extract_features(np.asarray(w), req.fs, req.rpm) for w in req.windows]
        return Baseline.fit(feats).to_payload()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@app.post("/score", dependencies=[Depends(require_key)])
def score(req: ScoreRequest) -> dict:
    """Score one recorded window against the machine's own baseline.

    A window that cannot be trusted (flatline, clipping, dropout) is not scored: it is reported as
    rejected, so a dead sensor never reads as a healthy machine.
    """
    baseline = _baseline(req.baseline)  # a bad baseline is a caller error whatever the signal looks like
    x = np.asarray(req.signal)
    quality = window_quality(x, req.fs)
    if not quality["ok"]:
        return {"rejected": True, "issues": quality["issues"], "model_version": MODEL_VERSION}
    return _result(x, req.fs, req.rpm, baseline)


@app.post("/demo/baseline", dependencies=[Depends(require_key)])
def demo_baseline(req: DemoBaselineRequest) -> dict:
    """Baseline for a simulated machine: 30 healthy windows, deterministic per machine."""
    base = abs(hash_seed(req.asset_id))
    windows = [extract_features(generate_vibration(req.fs, 1.0, req.rpm, 0.0, seed=base + i), req.fs, req.rpm) for i in range(30)]
    return Baseline.fit(windows).to_payload()


@app.post("/demo/score", dependencies=[Depends(require_key)])
def demo_score(req: DemoScoreRequest) -> dict:
    """One simulated sensor window at the given damage level, scored with the real pipeline."""
    x = generate_vibration(req.fs, 1.0, req.rpm, req.severity, req.seed)
    return {"asset_id": req.asset_id, "source": "simulated sensor", **_result(x, req.fs, req.rpm, _baseline(req.baseline), req.severity, req.seed)}


@app.post("/demo/series", dependencies=[Depends(require_key)])
def demo_series(req: DemoSeriesRequest) -> dict:
    """Backfill: one simulated window per requested damage level (used to create dummy history)."""
    baseline = _baseline(req.baseline)
    base = abs(hash_seed(req.asset_id)) + req.seed
    points = []
    for i, sev in enumerate(req.severities):
        if not 0.0 <= sev <= 1.0:
            raise HTTPException(status_code=422, detail="severity must be between 0 and 1")
        x = generate_vibration(req.fs, 1.0, req.rpm, sev, base + 10_000 + i)
        points.append(_result(x, req.fs, req.rpm, baseline, sev, base + i))
    return {"asset_id": req.asset_id, "source": "simulated sensor", "points": points}
