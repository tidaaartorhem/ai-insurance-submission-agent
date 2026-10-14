"""Tests for the FirstLook deterministic triage pipeline."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.schema import COLUMN_GROUPS, MEDICAL_FIELDS, answered_count, is_missing
from services.packet import audit_packet
from services.appetite import score_appetite, check_clause
from services.riskband import build_rating_table, predict_band
from services.flags import flag_submission
from services.action import recommend, QUOTE, REQUEST_INFO, REFER_UNDERWRITER, DECLINE
from services.memo import draft_memo

STATS = {"bmi_p90": 0.70, "age_p5": 0.05, "age_p95": 0.95}


def full_row(**over):
    """A clean, quotable applicant row: every field answered."""
    row = {}
    for cols in COLUMN_GROUPS.values():
        for c in cols:
            row[c] = 1
    row["Ins_Age"] = 0.4
    row["Ht"] = 0.5
    row["Wt"] = 0.5
    row["BMI"] = 0.45
    for i in range(1, 49):
        row[f"Medical_Keyword_{i}"] = 0
    for i in range(1, 6):
        row[f"Family_Hist_{i}"] = 3
    row.update(over)
    return row


def test_packet_complete_row():
    comp = audit_packet(full_row())
    assert comp["is_complete"]
    assert comp["completeness_pct"] == 100.0
    assert comp["missing_count"] == 0


def test_packet_missing_fields_listed():
    row = full_row()
    row["Ins_Age"] = None
    row["Employment_Info_3"] = None
    comp = audit_packet(row)
    assert not comp["is_complete"]
    assert comp["missing_count"] == 2
    fields = {m["field"] for m in comp["missing_items"]}
    assert fields == {"Ins_Age", "Employment_Info_3"}


def test_packet_document_breakdown():
    row = full_row()
    row["BMI"] = None
    comp = audit_packet(row)
    demo = [d for d in comp["documents"] if d["id"] == "DOC-DEMO"][0]
    assert not demo["complete"]
    assert demo["missing_fields"] == ["BMI"]


def test_packet_disclosure_sections_not_gated():
    # An empty medical section is a complete answer, not a missing document.
    row = full_row()
    for c in MEDICAL_FIELDS:
        row[c] = None
    comp = audit_packet(row)
    assert comp["is_complete"]


def test_appetite_clean_row_full_score():
    app = score_appetite(full_row())
    assert app["fit_score"] == 100
    assert not app["hard_fail"]
    assert all(c["passed"] for c in app["checks"])


def test_appetite_bmi_hard_fail_is_evidence():
    app = score_appetite(full_row(BMI=0.85))
    assert app["hard_fail"]
    bmi = [c for c in app["checks"] if c["code"] == "APP-2"][0]
    assert not bmi["passed"] and bmi["fail_reason"] == "evidence"


def test_appetite_missing_age_is_not_hard_fail():
    row = full_row()
    row["Ins_Age"] = None
    app = score_appetite(row)
    assert not app["hard_fail"]
    age = [c for c in app["checks"] if c["code"] == "APP-1"][0]
    assert age["fail_reason"] == "missing"


def test_appetite_preferred_band_is_soft():
    app = score_appetite(full_row(BMI=0.65))  # within limit, outside preferred
    assert not app["hard_fail"]
    assert app["fit_score"] == 85
    pref = [c for c in app["checks"] if c["code"] == "APP-3"][0]
    assert not pref["passed"]


def test_scorecard_predicts_observed_shifts():
    recs = [{"Ins_Age": 0.4, "BMI": 0.45, "Response": 6} for _ in range(60)]
    recs += [{"Ins_Age": 0.4, "BMI": 0.9, "Response": 3} for _ in range(20)]
    table = build_rating_table(recs)
    assert table["calibration_n"] == 80
    low_bmi = predict_band(table, {"Ins_Age": 0.4, "BMI": 0.45})
    high_bmi = predict_band(table, {"Ins_Age": 0.4, "BMI": 0.9})
    assert low_bmi["band"] > high_bmi["band"]
    assert low_bmi["factors"]  # every rating cites its factors


def test_scorecard_fallback_on_missing():
    table = build_rating_table([{"Ins_Age": 0.4, "BMI": 0.45, "Response": 5}])
    got = predict_band(table, {"Ins_Age": None, "BMI": 0.45})
    assert got["band"] == 5
    assert got["factors"] == []


def test_flags_build_outlier():
    flags = flag_submission(full_row(BMI=0.8), {"band": 6}, STATS)
    assert any(f["code"] == "F1" for f in flags)


def test_flags_thin_medical_evidence():
    row = full_row()
    for c in MEDICAL_FIELDS[:60]:
        row[c] = None
    flags = flag_submission(row, {"band": 6}, STATS)
    assert any(f["code"] == "F3" for f in flags)


def test_flags_elevated_risk_band():
    flags = flag_submission(full_row(), {"band": 3}, STATS)
    assert any(f["code"] == "F4" for f in flags)


def test_flags_clean_row_empty():
    assert flag_submission(full_row(), {"band": 6}, STATS) == []


def test_recommend_quote():
    comp = audit_packet(full_row())
    app = score_appetite(full_row())
    rec = recommend(comp, app, [], {"band": 6})
    assert rec["action"] == QUOTE


def test_recommend_request_info():
    row = full_row()
    row["Ins_Age"] = None
    comp = audit_packet(row)
    app = score_appetite(row)
    rec = recommend(comp, app, [], {"band": 6})
    assert rec["action"] == REQUEST_INFO


def test_recommend_decline_on_evidence():
    row = full_row(BMI=0.9)
    comp = audit_packet(row)
    app = score_appetite(row)
    rec = recommend(comp, app, [], {"band": 3})
    assert rec["action"] == DECLINE
    assert any("APP-2" in r for r in rec["rationale"])


def test_recommend_refer_on_flag():
    comp = audit_packet(full_row())
    app = score_appetite(full_row())
    rec = recommend(comp, app, [{"code": "F1", "label": "x", "detail": "y"}], {"band": 6})
    assert rec["action"] == REFER_UNDERWRITER


def test_recommend_refer_on_low_band():
    comp = audit_packet(full_row())
    app = score_appetite(full_row())
    rec = recommend(comp, app, [], {"band": 4})
    assert rec["action"] == REFER_UNDERWRITER


def test_memo_contains_evidence():
    row = full_row()
    comp = audit_packet(row)
    app = score_appetite(row)
    band = {"band": 6, "explanation": "test explanation"}
    rec = recommend(comp, app, [], band)
    sub = {"submission_id": "SUB-0001", "age": 0.4, "bmi": 0.45, "med_answered": 89}
    memo = draft_memo(sub, comp, app, [], band, rec)
    assert "SUB-0001" in memo
    assert "QUOTE" in memo
    assert "human-gated" in memo
    assert "test explanation" in memo
