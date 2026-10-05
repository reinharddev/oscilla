"""Validate the health pipeline on the CWRU bearing dataset (real recordings).

Data: Case Western Reserve University Bearing Data Center, 12 kHz drive-end accelerometer,
0 hp load (about 1797 rpm). Download the .mat files listed in FILES from
https://engineering.case.edu/bearingdatacenter into health-service/data/cwru/ (git-ignored).

Protocol
  * The baseline is learned from the first half of the normal recording only.
  * Normal windows from the second half are held out and scored like any other window.
  * Every fault recording is cut into non-overlapping 1 s windows and scored with the
    unchanged production code (extract_features + score_window). Nothing is tuned on CWRU.

Run:  .venv/bin/python -m validation.cwru [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import loadmat
from scipy.stats import rankdata

from app.features import extract_features
from app.scoring import MODEL_VERSION, Baseline, score_window, status_of

DATA = Path(__file__).resolve().parent.parent / "data" / "cwru"
FS = 12_000
RPM = 1797.0  # 0 hp
# file number -> (fault type, fault diameter in inches)
FILES = {
    97: ("normal", 0.0),
    105: ("inner_race", 0.007), 169: ("inner_race", 0.014), 209: ("inner_race", 0.021),
    118: ("ball", 0.007), 185: ("ball", 0.014), 222: ("ball", 0.021),
    130: ("outer_race", 0.007), 197: ("outer_race", 0.014), 234: ("outer_race", 0.021),
}


def load_signal(num: int) -> np.ndarray:
    mat = loadmat(DATA / f"{num}.mat")
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=float).ravel()


def windows(x: np.ndarray, seconds: float = 1.0) -> list[np.ndarray]:
    n = int(FS * seconds)
    return [x[i : i + n] for i in range(0, len(x) - n + 1, n)]


def auroc(neg: np.ndarray, pos: np.ndarray) -> float:
    """Probability that a random faulty window scores lower than a random normal one."""
    s = np.concatenate([-neg, -pos])  # lower health score = more abnormal
    r = rankdata(s)
    n_neg, n_pos = len(neg), len(pos)
    return float((r[n_neg:].sum() - n_pos * (n_pos + 1) / 2) / (n_neg * n_pos))


def run() -> dict:
    missing = [n for n in FILES if not (DATA / f"{n}.mat").exists()]
    if missing:
        raise FileNotFoundError(f"missing CWRU files {missing} in {DATA}")

    normal = windows(load_signal(97))
    half = len(normal) // 2
    baseline = Baseline.fit([extract_features(w, FS, RPM) for w in normal[:half]])
    held = np.array([score_window(baseline, extract_features(w, FS, RPM))["score"] for w in normal[half:]])

    rows = []
    for num, (fault, dia) in FILES.items():
        if fault == "normal":
            continue
        sc = np.array([score_window(baseline, extract_features(w, FS, RPM))["score"] for w in windows(load_signal(num))])
        rows.append({
            "file": num, "fault": fault, "diameter_in": dia, "windows": len(sc),
            "median_score": round(float(np.median(sc)), 1),
            "p10_score": round(float(np.percentile(sc, 10)), 1),
            "detected_pct": round(100 * float(np.mean(sc < 75)), 1),   # status other than healthy
            "critical_pct": round(100 * float(np.mean(sc < 50)), 1),
            "auroc": round(auroc(held, sc), 3),
        })

    return {
        "model_version": MODEL_VERSION, "fs": FS, "rpm": RPM,
        "baseline_windows": half, "heldout_normal_windows": len(held),
        "normal": {
            "median_score": round(float(np.median(held)), 1),
            "false_alarm_pct": round(100 * float(np.mean(held < 75)), 1),
        },
        "faults": rows,
    }


def render(r: dict) -> str:
    out = [
        f"Model {r['model_version']} on CWRU 12 kHz drive end, 0 hp. Baseline: {r['baseline_windows']} normal windows; "
        f"held-out normal: {r['heldout_normal_windows']} windows.",
        f"Held-out normal: median score {r['normal']['median_score']}, false alarms {r['normal']['false_alarm_pct']}% (score < 75).",
        "",
        f"{'fault':<11}{'size':>7}{'wins':>6}{'median':>8}{'p10':>7}{'detected':>10}{'critical':>10}{'AUROC':>8}",
    ]
    for f in r["faults"]:
        out.append(f"{f['fault']:<11}{f['diameter_in']:>7.3f}{f['windows']:>6}{f['median_score']:>8}{f['p10_score']:>7}{f['detected_pct']:>9}%{f['critical_pct']:>9}%{f['auroc']:>8}")
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    args = ap.parse_args()
    try:
        res = run()
    except FileNotFoundError as e:
        sys.exit(str(e))
    print(render(res))
    if args.json:
        Path(args.json).write_text(json.dumps(res, indent=2))
