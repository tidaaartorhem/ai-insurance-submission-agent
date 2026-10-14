"""Carrier appetite fit: does this submission fit the book we want to write?

The appetite statement is SEEDED (disclosed in README) — it models how a
life carrier publishes underwriting appetite: hard stops plus scored
preferences. Only documented columns (age, build) and answered-field counts
are used; anonymized columns are never given invented meanings.

Band scale note: Prudential's Response is ordinal 1-8 where 8 = lowest risk.
"""

from services.schema import MEDICAL_FIELDS, is_missing

# (code, label, weight, kind) — kind is "hard" (fail on evidence => decline)
# or "soft" (fail just lowers the fit score).
CLAUSES = [
    ("APP-1", "Applicant age within target book", 30, "hard"),
    ("APP-2", "Build (BMI) within limit", 30, "hard"),
    ("APP-3", "Preferred build (BMI)", 15, "soft"),
    ("APP-4", "Preferred age band", 15, "soft"),
    ("APP-5", "Medical evidence fully answered", 10, "soft"),
]

# Seeded appetite bounds, in the corpus's own units (Ins_Age/BMI are
# min-max normalized in the source data).
AGE_MIN, AGE_MAX = 0.10, 0.80
BMI_MAX = 0.70
BMI_PREFERRED_MAX = 0.55
AGE_PREF_MIN, AGE_PREF_MAX = 0.20, 0.65


def check_clause(code, row):
    age = row.get("Ins_Age")
    bmi = row.get("BMI")
    med_answered = sum(1 for c in MEDICAL_FIELDS if not is_missing(row.get(c)))

    if code == "APP-1":
        if age is None:
            return False, "missing", "Ins_Age missing — cannot assess age appetite"
        ok = AGE_MIN <= age <= AGE_MAX
        return ok, ("evidence" if not ok else None), \
            f"Ins_Age={round(age, 3)} vs target [{AGE_MIN}, {AGE_MAX}]"
    if code == "APP-2":
        if bmi is None:
            return False, "missing", "BMI missing — cannot assess build appetite"
        ok = bmi <= BMI_MAX
        return ok, ("evidence" if not ok else None), \
            f"BMI={round(bmi, 3)} vs ceiling {BMI_MAX}"
    if code == "APP-3":
        ok = bmi is not None and bmi <= BMI_PREFERRED_MAX
        return ok, None, f"BMI={None if bmi is None else round(bmi, 3)} vs preferred ceiling {BMI_PREFERRED_MAX}"
    if code == "APP-4":
        ok = age is not None and AGE_PREF_MIN <= age <= AGE_PREF_MAX
        return ok, None, f"Ins_Age={None if age is None else round(age, 3)} vs preferred [{AGE_PREF_MIN}, {AGE_PREF_MAX}]"
    if code == "APP-5":
        ok = med_answered == len(MEDICAL_FIELDS)
        return ok, None, f"{med_answered}/{len(MEDICAL_FIELDS)} medical fields answered"
    raise ValueError(code)


def score_appetite(row):
    """Return {fit_score, checks, hard_fail} — hard_fail only on real evidence,
    never on missing fields (missing fields route to REQUEST_INFO)."""
    checks, score, hard_fail = [], 0, False
    for code, label, weight, kind in CLAUSES:
        ok, reason, detail = check_clause(code, row)
        if ok:
            score += weight
        elif kind == "hard" and reason == "evidence":
            hard_fail = True
        checks.append({
            "code": code, "label": label, "weight": weight, "kind": kind,
            "passed": ok, "fail_reason": reason, "detail": detail,
        })
    return {"fit_score": score, "checks": checks, "hard_fail": hard_fail}
