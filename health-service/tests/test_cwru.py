"""Real-data check. Skipped unless the CWRU files are in health-service/data/cwru (see validation/cwru.py)."""
import pytest

from validation.cwru import DATA, FILES, run

pytestmark = pytest.mark.skipif(not all((DATA / f"{n}.mat").exists() for n in FILES), reason="CWRU data not downloaded")


def test_cwru_faults_are_flagged_and_held_out_normal_is_not():
    r = run()
    assert r["normal"]["false_alarm_pct"] <= 10
    for f in r["faults"]:
        assert f["median_score"] < 50, f
        assert f["auroc"] >= 0.95, f
