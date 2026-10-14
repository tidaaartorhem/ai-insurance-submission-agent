"""One recommended action per submission, with cited rationale.

Actions:
  QUOTE             — complete packet, in appetite, no flags, band >= 5. Ready to price.
  REQUEST_INFO      — packet incomplete. Lists exactly what to ask for.
  REFER_UNDERWRITER — complete but flagged, or band <= 4. Human decides.
  DECLINE           — hard appetite fail. Cite the clause, close the file fast.

Band scale (Prudential's ordinal): 8 = lowest risk ... 1 = highest risk.

Nothing here sends anything anywhere: the action is a recommendation behind a
human gate. The memo draft (services/memo.py) is the artifact the human
approves before anything leaves the brokerage.
"""

QUOTE, REQUEST_INFO, REFER_UNDERWRITER, DECLINE = (
    "QUOTE", "REQUEST_INFO", "REFER_UNDERWRITER", "DECLINE")


def recommend(completeness, appetite, flags, band_result):
    rationale = []
    if appetite["hard_fail"]:
        failed = [c for c in appetite["checks"] if c["kind"] == "hard" and not c["passed"]]
        rationale.append("Hard appetite fail: " + "; ".join(
            f"{c['code']} — {c['detail']}" for c in failed))
        return {"action": DECLINE, "rationale": rationale,
                "next_steps": ["Close the file with the decline letter citing the failed clause(s).",
                               "Offer to revisit if the applicant's circumstances change."]}

    if not completeness["is_complete"]:
        top = completeness["missing_items"][:5]
        rationale.append(
            f"Packet {completeness['completeness_pct']}% complete — "
            f"{completeness['missing_count']} fields missing, e.g. " +
            ", ".join(f"{m['label']} ({m['field']})" for m in top))
        return {"action": REQUEST_INFO, "rationale": rationale,
                "next_steps": ["Send the itemized request list to the client (see memo).",
                               "Hold the file; re-run triage when the packet is complete."]}

    if flags or band_result["band"] <= 4:
        if flags:
            rationale.append("Flagged: " + "; ".join(f"{f['code']} {f['label']}" for f in flags))
        if band_result["band"] <= 4:
            rationale.append(f"Rated risk band {band_result['band']}/8 (8 = lowest risk; quote threshold is band 5).")
        return {"action": REFER_UNDERWRITER, "rationale": rationale,
                "next_steps": ["Senior underwriter reviews flags and band evidence.",
                               "Underwriter decides: quote with loading, request more evidence, or decline."]}

    rationale.append(
        f"Packet complete, appetite fit {appetite['fit_score']}/100, "
        f"no flags, risk band {band_result['band']}/8 (8 = lowest risk).")
    return {"action": QUOTE, "rationale": rationale,
            "next_steps": ["Release to pricing with the rated band.",
                           "Attach the triage memo to the file for audit."]}
