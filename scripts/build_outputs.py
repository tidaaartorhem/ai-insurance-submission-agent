"""Build all frontend data artifacts from the real corpus.

Steps:
  1. Load train.csv (59,381 real Prudential applicant records).
  2. Seeded 80/20 split by Id -> calibration set / held-out eval pool.
  3. Calibrate the rating table on the 80%.
  4. Sample a stratified 180-submission demo queue from the eval pool.
  5. Deterministically inject as-received missingness into ~45% of the queue
     (seeded by submission id; disclosed and reproducible — models the real
     world where packets arrive incomplete).
  6. Run the full triage pipeline on each queued submission.
  7. Write web/public/data/*.json artifacts.

Usage: python scripts/build_outputs.py
"""

import csv
import hashlib
import json
import math
import os
import random
from collections import Counter

from services.schema import COLUMN_GROUPS, PACKET_DOCUMENTS, MEDICAL_FIELDS, answered_count, is_missing
from services.packet import audit_packet
from services.appetite import score_appetite, CLAUSES, AGE_MIN, AGE_MAX, BMI_MAX
from services.riskband import build_rating_table, predict_band, table_to_json
from services.flags import flag_submission
from services.action import recommend
from services.memo import draft_memo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "train.csv")
OUT = os.path.join(ROOT, "web", "public", "data")
SEED = 20261014
QUEUE_N = 180


def load_rows():
    with open(DATA, newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for r in reader:
            row = {}
            for k, v in r.items():
                if v == "" or v is None:
                    row[k] = None
                else:
                    try:
                        row[k] = float(v)
                    except ValueError:
                        row[k] = v
            rows.append(row)
    return rows


def corpus_stats(rows):
    def pct(vals, q):
        s = sorted(vals)
        return s[min(len(s) - 1, int(len(s) * q))]
    ages = [r["Ins_Age"] for r in rows if r["Ins_Age"] is not None]
    bmis = [r["BMI"] for r in rows if r["BMI"] is not None]
    return {
        "n": len(rows),
        "age_p5": round(pct(ages, 0.05), 4), "age_p95": round(pct(ages, 0.95), 4),
        "bmi_p90": round(pct(bmis, 0.90), 4),
        "response_dist": {str(k): v for k, v in sorted(Counter(r["Response"] for r in rows).items())},
    }


def inject_missingness(row, sub_id):
    """Deterministic as-received mask: ~45% of submissions lose 1-2 document
    groups (30-70% of each group's fields). Seeded by submission id."""
    h = int(hashlib.sha256(sub_id.encode()).hexdigest(), 16)
    rng = random.Random(h)
    if rng.random() > 0.30:
        return row, []
    groups = ["employment", "insurance_history", "family_history",
              "medical_history", "medical_keywords", "insured"]
    n_groups = 1 + (h % 2)
    chosen = rng.sample(groups, n_groups)
    masked = []
    row = dict(row)
    for g in chosen:
        cols = COLUMN_GROUPS[g]
        frac = 0.3 + (h % 40) / 100.0
        for c in rng.sample(cols, max(1, int(len(cols) * frac))):
            row[c] = None
            masked.append(c)
    return row, masked


def main():
    rows = load_rows()
    print(f"loaded {len(rows)} rows")
    rng = random.Random(SEED)
    calib = [r for r in rows if (int(r["Id"]) % 10) < 8]
    pool = [r for r in rows if (int(r["Id"]) % 10) >= 8]
    print(f"calibration={len(calib)} eval_pool={len(pool)}")

    stats = corpus_stats(rows)
    table = build_rating_table(calib)

    # Seeded random queue sample from the eval pool ("this morning's inbox").
    queue = rng.sample(pool, min(QUEUE_N, len(pool)))

    submissions = []
    action_counts = Counter()
    for i, r in enumerate(queue):
        sub_id = f"SUB-{i+1:04d}"
        masked_row, masked_fields = inject_missingness(r, sub_id)
        row = masked_row
        comp = audit_packet(row)
        app = score_appetite(row)
        band = predict_band(table, row)
        flags = flag_submission(row, band, stats)
        rec = recommend(comp, app, flags, band)
        action_counts[rec["action"]] += 1
        med_answered = sum(1 for c in MEDICAL_FIELDS if not is_missing(row.get(c)))
        sub = {
            "submission_id": sub_id,
            "source_id": int(r["Id"]),
            "true_band": int(r["Response"]),
            "age": None if row["Ins_Age"] is None else round(row["Ins_Age"], 3),
            "bmi": None if row["BMI"] is None else round(row["BMI"], 3),
            "med_answered": med_answered,
            "mask_applied": bool(masked_fields),
            "masked_fields": masked_fields,
            "completeness_pct": comp["completeness_pct"],
            "missing_count": comp["missing_count"],
            "missing_items": comp["missing_items"][:15],
            "documents": comp["documents"],
            "fit_score": app["fit_score"],
            "appetite_checks": app["checks"],
            "hard_fail": app["hard_fail"],
            "risk_band": band["band"],
            "band_cell": band["cell"],
            "band_cell_n": band["cell_n"],
            "band_explanation": band["explanation"],
            "flags": flags,
            "action": rec["action"],
            "rationale": rec["rationale"],
            "next_steps": rec["next_steps"],
        }
        sub["memo"] = draft_memo(sub, comp, app, flags, band, rec)
        submissions.append(sub)

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "queue.json"), "w") as f:
        json.dump(submissions, f)
    with open(os.path.join(OUT, "corpus_stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    with open(os.path.join(OUT, "rating_table.json"), "w") as f:
        json.dump(table_to_json(table), f)
    with open(os.path.join(OUT, "appetite.json"), "w") as f:
        json.dump({
            "clauses": [{"code": c, "label": l, "weight": w, "kind": k} for c, l, w, k in CLAUSES],
            "bounds": {"age_min": AGE_MIN, "age_max": AGE_MAX, "bmi_max": BMI_MAX},
            "note": "Seeded carrier appetite statement (disclosed).",
        }, f, indent=1)

    band_agree = sum(1 for s in submissions if s["risk_band"] == s["true_band"])
    brief = {
        "generated": "2026-10-14",
        "queue_n": len(submissions),
        "action_mix": dict(action_counts),
        "band_agreement_exact": f"{band_agree}/{len(submissions)}",
        "band_agreement_pct": round(100 * band_agree / len(submissions), 1),
        "mean_completeness": round(sum(s["completeness_pct"] for s in submissions) / len(submissions), 1),
        "mean_fit": round(sum(s["fit_score"] for s in submissions) / len(submissions), 1),
        "headline": (f"{len(submissions)} submissions triaged: "
                     f"{action_counts.get('QUOTE', 0)} ready to quote, "
                     f"{action_counts.get('REQUEST_INFO', 0)} need client follow-up, "
                     f"{action_counts.get('REFER_UNDERWRITER', 0)} need underwriter review, "
                     f"{action_counts.get('DECLINE', 0)} declined on appetite."),
    }
    with open(os.path.join(OUT, "brief.json"), "w") as f:
        json.dump(brief, f, indent=1)

    print(brief["headline"])
    print("band agreement (exact):", brief["band_agreement_pct"], "%")


if __name__ == "__main__":
    main()
