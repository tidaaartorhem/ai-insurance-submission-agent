"""Flag rules: ordered, deterministic, cited. Every flag has a code.

Flags do not decline a submission by themselves; they route it to a human
underwriter (REFER_UNDERWRITER) with the evidence attached. Thresholds are
calibrated on the real corpus and disclosed in the README. Band scale:
8 = lowest risk, 1 = highest risk.
"""

from services.schema import MEDICAL_FIELDS, is_missing


def flag_submission(row, band_result, corpus_stats):
    """Return a list of {code, label, detail} flags, highest priority first."""
    flags = []
    age, bmi = row.get("Ins_Age"), row.get("BMI")
    med_answered = sum(1 for c in MEDICAL_FIELDS if not is_missing(row.get(c)))
    p = corpus_stats  # percentiles calibrated on the full corpus

    if bmi is not None and bmi >= p["bmi_p90"]:
        flags.append({"code": "F1", "label": "Build outlier",
                      "detail": f"BMI {round(bmi, 3)} at/above corpus 90th percentile ({p['bmi_p90']})."})
    if age is not None and (age <= p["age_p5"] or age >= p["age_p95"]):
        flags.append({"code": "F2", "label": "Age tail",
                      "detail": f"Ins_Age {round(age, 3)} outside corpus 5th-95th percentile band."})
    if med_answered < 80:
        flags.append({"code": "F3", "label": "Thin medical evidence",
                      "detail": f"Only {med_answered}/89 medical fields answered; underwriting evidence is thin."})
    if band_result["band"] <= 3:
        flags.append({"code": "F4", "label": "Elevated risk band",
                      "detail": f"Rated band {band_result['band']}/8 (8 = lowest risk) — senior underwriter review required."})
    return flags
