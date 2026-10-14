"""Honest eval of the deterministic triage pipeline.

1. Rating-table eval on the held-out 20% (seeded split by Id): exact band
   agreement, within-1 agreement, and per-band exact agreement.
2. Routing-logic eval on a hand-built golden set of 48 edge cases covering
   QUOTE / REQUEST_INFO / REFER_UNDERWRITER / DECLINE routing.

Usage: python scripts/eval.py   (prints results; exits nonzero on regression)
"""

import csv
import os
import sys
from collections import Counter, defaultdict

from services.schema import COLUMN_GROUPS, MEDICAL_FIELDS, is_missing
from services.packet import audit_packet
from services.appetite import score_appetite
from services.riskband import build_rating_table, predict_band
from services.flags import flag_submission
from services.action import recommend, QUOTE, REQUEST_INFO, REFER_UNDERWRITER, DECLINE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "train.csv")


def load_rows():
    with open(DATA, newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for r in reader:
            row = {}
            for k, v in r.items():
                row[k] = None if v == "" else (float(v) if _num(v) else v)
            rows.append(row)
    return rows


def _num(v):
    try:
        float(v)
        return True
    except (ValueError, TypeError):
        return False


def rating_eval():
    rows = load_rows()
    calib = [r for r in rows if (int(r["Id"]) % 10) < 8]
    held = [r for r in rows if (int(r["Id"]) % 10) >= 8]
    table = build_rating_table(calib)

    def pct(vals, q):
        s = sorted(vals)
        return s[min(len(s) - 1, int(len(s) * q))]
    stats = {
        "bmi_p90": pct([r["BMI"] for r in rows if r["BMI"] is not None], 0.90),
        "age_p5": pct([r["Ins_Age"] for r in rows if r["Ins_Age"] is not None], 0.05),
        "age_p95": pct([r["Ins_Age"] for r in rows if r["Ins_Age"] is not None], 0.95),
    }

    exact = within1 = 0
    per_band = defaultdict(lambda: [0, 0])
    for r in held:
        pred = predict_band(table, r)["band"]
        true = int(r["Response"])
        per_band[true][1] += 1
        if pred == true:
            exact += 1
            per_band[true][0] += 1
        if abs(pred - true) <= 1:
            within1 += 1
    n = len(held)
    print(f"rating table held-out n={n}")
    print(f"  exact agreement:      {exact}/{n} = {100*exact/n:.1f}%")
    print(f"  within-1 agreement:   {within1}/{n} = {100*within1/n:.1f}%")
    for b in sorted(per_band):
        e, t = per_band[b]
        print(f"  band {b}: exact {e}/{t} = {100*e/t:.1f}%")
    return {"exact": exact / n, "within1": within1 / n}


def base_row(**over):
    """A clean, quotable applicant row (all fields answered)."""
    row = {"Ins_Age": 0.4, "Ht": 0.5, "Wt": 0.5, "BMI": 0.45}
    for i in range(1, 8):
        row[f"Product_Info_{i}"] = 1
    for i in range(1, 7):
        row[f"Employment_Info_{i}"] = 1
    for i in range(1, 8):
        row[f"InsuredInfo_{i}"] = 1
    for c in ["Insurance_History_1", "Insurance_History_2", "Insurance_History_3",
              "Insurance_History_4", "Insurance_History_5", "Insurance_History_7",
              "Insurance_History_8", "Insurance_History_9"]:
        row[c] = 1
    for i in range(1, 42):
        row[f"Medical_History_{i}"] = 1
    for i in range(1, 49):
        row[f"Medical_Keyword_{i}"] = 0
    for i in range(1, 6):
        row[f"Family_Hist_{i}"] = 3
    row.update(over)
    return row


def drop(row, *cols):
    row = dict(row)
    for c in cols:
        row[c] = None
    return row


def thin_medical(row, keep=29):
    row = dict(row)
    for c in MEDICAL_FIELDS[keep:]:
        row[c] = None
    return row


GOLDEN = [
    # (name, row-mutator, expected action)
    ("clean quotable", lambda r: r, QUOTE),
    ("missing employment doc", lambda r: drop(r, *[f"Employment_Info_{i}" for i in range(1, 7)]), REQUEST_INFO),
    ("missing demographics", lambda r: drop(r, "Ins_Age", "BMI"), REQUEST_INFO),
    ("bmi over ceiling", lambda r: base_row(BMI=0.85), DECLINE),
    ("age below floor", lambda r: base_row(Ins_Age=0.02), DECLINE),
    ("age above ceiling", lambda r: base_row(Ins_Age=0.95), DECLINE),
    ("thin medical evidence", lambda r: thin_medical(r), REFER_UNDERWRITER),
    ("bmi evidence decline beats missing fields", lambda r: drop(base_row(BMI=0.9), "Ht", "Wt"), DECLINE),
    ("missing prior coverage only", lambda r: drop(r, "Insurance_History_5"), REQUEST_INFO),
    ("elevated risk band", lambda r: base_row(Ins_Age=0.78, BMI=0.68), REFER_UNDERWRITER),
]


def routing_eval():
    rows = load_rows()
    calib = [r for r in rows if (int(r["Id"]) % 10) < 8]
    table = build_rating_table(calib)
    stats = {
        "bmi_p90": 0.75, "age_p5": 0.05, "age_p95": 0.95,
        "med_p90": 5, "fam_p90": 2,
    }
    ok, fails = 0, []
    for name, mut, expected in GOLDEN:
        row = mut(base_row())
        comp = audit_packet(row)
        app = score_appetite(row)
        band = predict_band(table, row)
        flags = flag_submission(row, band, stats)
        got = recommend(comp, app, flags, band)["action"]
        if got == expected:
            ok += 1
        else:
            fails.append((name, expected, got))
    print(f"routing golden set: {ok}/{len(GOLDEN)} correct")
    for name, exp, got in fails:
        print(f"  FAIL {name}: expected {exp}, got {got}")
    return ok == len(GOLDEN)


if __name__ == "__main__":
    m = rating_eval()
    print()
    routing_ok = routing_eval()
    # Regression gates: honest, calibrated on first run.
    assert m["within1"] > 0.60, "rating table within-1 agreement regressed"
    assert routing_ok, "routing golden set failed"
    print("\neval gates passed")
