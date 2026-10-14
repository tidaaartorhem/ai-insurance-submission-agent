"""Deterministic risk-band scorecard, calibrated on the real corpus.

Instead of an opaque classifier, FirstLook rates submissions the way
actuaries publish rating manuals: a transparent additive scorecard.

  band = clamp(round(global_median + age_adj + bmi_adj), 1, 8)

Each adjustment is the observed median Response shift for that factor level
in the calibration set (59,381 real Prudential applicant records, seeded
80/20 split). Band scale: 8 = lowest risk, 1 = highest risk. Every rating
cites each factor's contribution, so a broker can see exactly why a
submission rated band 4 and not band 6.
"""

import statistics

AGE_BINS = 10
BMI_BINS = 4


def med_tier(med_count):
    if med_count == 0:
        return 0
    if med_count <= 2:
        return 1
    return 2


def _edges(vals, k):
    s = sorted(vals)
    n = len(s)
    return [s[min(n - 1, int(n * i / k))] for i in range(k)] + [float("inf")]


def _bucket(v, edges):
    for i in range(len(edges) - 1):
        if v <= edges[i + 1] + 1e-12:
            return i
    return len(edges) - 2


def _median(vals):
    return statistics.median(sorted(vals))


def build_rating_table(records):
    """Calibrate the scorecard. records need Ins_Age, BMI, Response."""
    ok = [r for r in records
          if r["Ins_Age"] is not None and r["BMI"] is not None and r.get("Response") is not None]
    glob = _median([r["Response"] for r in ok])
    age_edges = _edges([r["Ins_Age"] for r in ok], AGE_BINS)
    bmi_edges = _edges([r["BMI"] for r in ok], BMI_BINS)

    def adj(levels, keyfn):
        out = []
        for lv in levels:
            vals = [r["Response"] for r in ok if keyfn(r) == lv]
            out.append(round(_median(vals) - glob) if vals else 0)
        return out

    age_adj = adj(range(AGE_BINS), lambda r: _bucket(r["Ins_Age"], age_edges))
    bmi_adj = adj(range(BMI_BINS), lambda r: _bucket(r["BMI"], bmi_edges))
    return {
        "global_median": glob,
        "age_edges": age_edges, "bmi_edges": bmi_edges,
        "age_adj": age_adj, "bmi_adj": bmi_adj,
        "calibration_n": len(ok),
    }


def predict_band(table, row):
    """Return {band, factors, explanation} for one submission."""
    age, bmi = row.get("Ins_Age"), row.get("BMI")
    if age is None or bmi is None:
        band = int(table["global_median"])
        return {"band": band, "cell": None, "cell_n": table["calibration_n"],
                "factors": [],
                "explanation": f"Age or BMI missing; rated at corpus median band {band}."}
    a = _bucket(age, table["age_edges"])
    b = _bucket(bmi, table["bmi_edges"])
    fa, fb = table["age_adj"][a], table["bmi_adj"][b]
    raw = table["global_median"] + fa + fb
    band = max(1, min(8, int(round(raw))))
    factors = [
        {"factor": "age", "level": f"decile {a + 1}/10", "adjustment": fa},
        {"factor": "bmi", "level": f"quartile {b + 1}/4", "adjustment": fb},
    ]
    parts = ", ".join(f"{f['factor']} {f['level']} ({f['adjustment']:+d})" for f in factors)
    return {
        "band": band,
        "cell": {"age_decile": a + 1, "bmi_quartile": b + 1},
        "cell_n": table["calibration_n"],
        "factors": factors,
        "explanation": (f"Scorecard: base band {int(table['global_median'])} "
                        f"{parts} = {raw:.1f} -> band {band}/8 (8 = lowest risk). "
                        f"Adjustments are observed median shifts in {table['calibration_n']} calibrated records."),
    }


def table_to_json(table):
    return {
        "global_median": table["global_median"],
        "age_edges": table["age_edges"],
        "bmi_edges": table["bmi_edges"],
        "age_adj": table["age_adj"],
        "bmi_adj": table["bmi_adj"],
        "calibration_n": table["calibration_n"],
    }
