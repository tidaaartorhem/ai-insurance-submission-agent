"""Shared column registry and packet schema for FirstLook.

The pipeline works on real applicant records from the Prudential Life Insurance
Assessment corpus (Kaggle, 59,381 rows). Feature groups are named exactly as in
the source CSV; only columns whose real-world meaning is documented are given
human labels. Anonymized flag columns are treated as disclosure counts, never
given invented semantics.
"""

COLUMN_GROUPS = {
    "product": [f"Product_Info_{i}" for i in range(1, 8)],
    "demographics": ["Ins_Age", "Ht", "Wt", "BMI"],
    "employment": [f"Employment_Info_{i}" for i in range(1, 7)],
    "insured": [f"InsuredInfo_{i}" for i in range(1, 8)],
    "insurance_history": [
        "Insurance_History_1", "Insurance_History_2", "Insurance_History_3",
        "Insurance_History_4", "Insurance_History_5", "Insurance_History_7",
        "Insurance_History_8", "Insurance_History_9",
    ],
    "family_history": [f"Family_Hist_{i}" for i in range(1, 6)],
    "medical_history": [f"Medical_History_{i}" for i in range(1, 42)],
    "medical_keywords": [f"Medical_Keyword_{i}" for i in range(1, 49)],
}

# The "submission packet": what a complete new-business file must contain.
# Each document maps to real field groups in the corpus.
# "gates" documents must be fully present for the packet to be quotable.
# Disclosure sections (medical / family history) are NOT completeness-gated:
# a healthy applicant truthfully discloses nothing, so an empty disclosure
# section is a complete answer. Disclosures feed the risk side instead
# (appetite clauses APP-3/APP-4 and flag rules F3/F4).
PACKET_DOCUMENTS = [
    ("DOC-APP", "Application form", "product", "Product / coverage details", True),
    ("DOC-ID", "Applicant identity", "insured", "Applicant identity fields", True),
    ("DOC-DEMO", "Demographics & build", "demographics", "Age, height, weight, BMI", True),
    ("DOC-EMP", "Employment & occupation", "employment", "Employment evidence", True),
    ("DOC-PRIOR", "Prior coverage history", "insurance_history", "Prior insurance evidence", True),
    ("DOC-FAM", "Family history disclosures", "family_history", "Disclosure profile (risk input)", False),
    ("DOC-MED", "Medical history disclosures", "medical_history", "Disclosure profile (risk input)", False),
    ("DOC-MEDKW", "Medical keyword disclosures", "medical_keywords", "Disclosure profile (risk input)", False),
]


MEDICAL_FIELDS = [f"Medical_History_{i}" for i in range(1, 42)] + \
                 [f"Medical_Keyword_{i}" for i in range(1, 49)]


def answered_count(row, group):
    """Number of non-missing fields in a group (no invented semantics:
    'answered' means the field has a value, nothing more)."""
    return sum(1 for c in COLUMN_GROUPS[group] if not is_missing(row.get(c)))


def _is_nan(v):
    try:
        return bool(v != v)
    except Exception:
        return False


def is_missing(v):
    if v is None or v == "":
        return True
    try:
        return bool(v != v)
    except Exception:
        return False
