"""Completeness audit: does the submission packet have every required field?

A new-business submission is only quotable when the packet is complete.
This module scores each submission 0-100 and lists exactly what is missing,
so the broker's first request back to the client is specific, not "incomplete".
"""

from services.schema import PACKET_DOCUMENTS, COLUMN_GROUPS, is_missing


def audit_packet(row):
    """Return {completeness_pct, missing_items, documents} for one submission row."""
    total, present = 0, 0
    missing_items = []
    documents = []
    for doc_id, label, group, desc, gates in PACKET_DOCUMENTS:
        cols = COLUMN_GROUPS[group]
        doc_present, doc_missing = 0, []
        for c in cols:
            if gates:
                total += 1
            if is_missing(row.get(c)):
                doc_missing.append(c)
                if gates:
                    missing_items.append({"document": doc_id, "label": label, "field": c})
            else:
                doc_present += 1
                if gates:
                    present += 1
        documents.append({
            "id": doc_id,
            "label": label,
            "description": desc,
            "gates_completeness": gates,
            "complete": doc_present == len(cols),
            "present": doc_present,
            "required": len(cols),
            "missing_fields": doc_missing,
        })
    pct = round(100.0 * present / total, 1) if total else 0.0
    return {
        "completeness_pct": pct,
        "fields_present": present,
        "fields_required": total,
        "missing_items": missing_items,
        "missing_count": len(missing_items),
        "documents": documents,
        "is_complete": len(missing_items) == 0,
    }
