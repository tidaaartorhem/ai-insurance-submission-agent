/**
 * In-browser mirror of the Python triage pipeline (services/).
 * Same ordered rules, same clause codes, same scorecard math — so the
 * "paste a submission" tab scores exactly what the batch pipeline scored.
 */

import type {
  Action, AppetiteCheck, Flag, RatingTable, Submission,
} from "./types";

export const GROUPS: Record<string, string[]> = {
  product: ["Product_Info_1", "Product_Info_2", "Product_Info_3", "Product_Info_4", "Product_Info_5", "Product_Info_6", "Product_Info_7"],
  insured: ["InsuredInfo_1", "InsuredInfo_2", "InsuredInfo_3", "InsuredInfo_4", "InsuredInfo_5", "InsuredInfo_6", "InsuredInfo_7"],
  demographics: ["Ins_Age", "Ht", "Wt", "BMI"],
  employment: ["Employment_Info_1", "Employment_Info_2", "Employment_Info_3", "Employment_Info_4", "Employment_Info_5", "Employment_Info_6"],
  insurance_history: ["Insurance_History_1", "Insurance_History_2", "Insurance_History_3", "Insurance_History_4", "Insurance_History_5", "Insurance_History_7", "Insurance_History_8", "Insurance_History_9"],
  family_history: ["Family_Hist_1", "Family_Hist_2", "Family_Hist_3", "Family_Hist_4", "Family_Hist_5"],
  medical_history: Array.from({ length: 41 }, (_, i) => `Medical_History_${i + 1}`),
  medical_keywords: Array.from({ length: 48 }, (_, i) => `Medical_Keyword_${i + 1}`),
};

const MEDICAL_FIELDS = [...GROUPS.medical_history, ...GROUPS.medical_keywords];

interface DocDef { id: string; label: string; desc: string; group: string; gates: boolean }

export const PACKET_DOCS: DocDef[] = [
  { id: "DOC-APP", label: "Application form", desc: "Product / coverage details", group: "product", gates: true },
  { id: "DOC-ID", label: "Applicant identity", desc: "Applicant identity fields", group: "insured", gates: true },
  { id: "DOC-DEMO", label: "Demographics & build", desc: "Age, height, weight, BMI", group: "demographics", gates: true },
  { id: "DOC-EMP", label: "Employment & occupation", desc: "Employment evidence", group: "employment", gates: true },
  { id: "DOC-PRIOR", label: "Prior coverage history", desc: "Prior insurance evidence", group: "insurance_history", gates: true },
  { id: "DOC-FAM", label: "Family history disclosures", desc: "Disclosure profile (risk input)", group: "family_history", gates: false },
  { id: "DOC-MED", label: "Medical history disclosures", desc: "Disclosure profile (risk input)", group: "medical_history", gates: false },
  { id: "DOC-MEDKW", label: "Medical keyword disclosures", desc: "Disclosure profile (risk input)", group: "medical_keywords", gates: false },
];

export type Row = Record<string, number | string | null | undefined>;

export function isMissing(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

export interface PacketResult {
  completeness_pct: number;
  missing_count: number;
  missing_items: { document: string; label: string; field: string }[];
  documents: { id: string; label: string; description: string; gates_completeness: boolean; complete: boolean; present: number; required: number; missing_fields: string[] }[];
  is_complete: boolean;
}

export function auditPacket(row: Row): PacketResult {
  let total = 0, present = 0;
  const missing_items: PacketResult["missing_items"] = [];
  const documents: PacketResult["documents"] = [];
  for (const d of PACKET_DOCS) {
    const cols = GROUPS[d.group];
    let docPresent = 0;
    const docMissing: string[] = [];
    for (const c of cols) {
      if (d.gates) total += 1;
      if (isMissing(row[c])) {
        docMissing.push(c);
        if (d.gates) missing_items.push({ document: d.id, label: d.label, field: c });
      } else {
        docPresent += 1;
        if (d.gates) present += 1;
      }
    }
    documents.push({
      id: d.id, label: d.label, description: d.desc, gates_completeness: d.gates,
      complete: docPresent === cols.length, present: docPresent, required: cols.length,
      missing_fields: docMissing,
    });
  }
  return {
    completeness_pct: total ? Math.round((1000 * present) / total) / 10 : 0,
    missing_count: missing_items.length,
    missing_items,
    documents,
    is_complete: missing_items.length === 0,
  };
}

// --- Appetite ---

const AGE_MIN = 0.10, AGE_MAX = 0.80, BMI_MAX = 0.70;
const BMI_PREF = 0.55, AGE_PREF_MIN = 0.20, AGE_PREF_MAX = 0.65;

const CLAUSES: { code: string; label: string; weight: number; kind: "hard" | "soft" }[] = [
  { code: "APP-1", label: "Applicant age within target book", weight: 30, kind: "hard" },
  { code: "APP-2", label: "Build (BMI) within limit", weight: 30, kind: "hard" },
  { code: "APP-3", label: "Preferred build (BMI)", weight: 15, kind: "soft" },
  { code: "APP-4", label: "Preferred age band", weight: 15, kind: "soft" },
  { code: "APP-5", label: "Medical evidence fully answered", weight: 10, kind: "soft" },
];

function checkClause(code: string, row: Row): { ok: boolean; reason: string | null; detail: string } {
  const age = row["Ins_Age"] as number | null;
  const bmi = row["BMI"] as number | null;
  const medAnswered = MEDICAL_FIELDS.filter((c) => !isMissing(row[c])).length;
  const r3 = (v: number | null | undefined) => (v === null || v === undefined ? "missing" : Math.round(v * 1000) / 1000);
  switch (code) {
    case "APP-1":
      if (isMissing(age)) return { ok: false, reason: "missing", detail: "Ins_Age missing — cannot assess age appetite" };
      return { ok: age! >= AGE_MIN && age! <= AGE_MAX, reason: age! >= AGE_MIN && age! <= AGE_MAX ? null : "evidence", detail: `Ins_Age=${r3(age)} vs target [${AGE_MIN}, ${AGE_MAX}]` };
    case "APP-2":
      if (isMissing(bmi)) return { ok: false, reason: "missing", detail: "BMI missing — cannot assess build appetite" };
      return { ok: bmi! <= BMI_MAX, reason: bmi! <= BMI_MAX ? null : "evidence", detail: `BMI=${r3(bmi)} vs ceiling ${BMI_MAX}` };
    case "APP-3":
      return { ok: !isMissing(bmi) && bmi! <= BMI_PREF, reason: null, detail: `BMI=${r3(bmi)} vs preferred ceiling ${BMI_PREF}` };
    case "APP-4":
      return { ok: !isMissing(age) && age! >= AGE_PREF_MIN && age! <= AGE_PREF_MAX, reason: null, detail: `Ins_Age=${r3(age)} vs preferred [${AGE_PREF_MIN}, ${AGE_PREF_MAX}]` };
    case "APP-5":
      return { ok: medAnswered === MEDICAL_FIELDS.length, reason: null, detail: `${medAnswered}/${MEDICAL_FIELDS.length} medical fields answered` };
    default:
      throw new Error(code);
  }
}

export function scoreAppetite(row: Row): { fit_score: number; checks: AppetiteCheck[]; hard_fail: boolean } {
  const checks: AppetiteCheck[] = [];
  let score = 0, hard_fail = false;
  for (const c of CLAUSES) {
    const { ok, reason, detail } = checkClause(c.code, row);
    if (ok) score += c.weight;
    else if (c.kind === "hard" && reason === "evidence") hard_fail = true;
    checks.push({ code: c.code, label: c.label, weight: c.weight, kind: c.kind, passed: ok, fail_reason: reason, detail });
  }
  return { fit_score: score, checks, hard_fail };
}

// --- Scorecard ---

function bucket(v: number, edges: number[]): number {
  for (let i = 0; i < edges.length - 1; i++) {
    if (v <= edges[i + 1] + 1e-12) return i;
  }
  return edges.length - 2;
}

export function predictBand(table: RatingTable, row: Row): { band: number; explanation: string; factors: { factor: string; level: string; adjustment: number }[] } {
  const age = row["Ins_Age"] as number | null;
  const bmi = row["BMI"] as number | null;
  if (isMissing(age) || isMissing(bmi)) {
    const band = Math.round(table.global_median);
    return { band, factors: [], explanation: `Age or BMI missing; rated at corpus median band ${band}.` };
  }
  const a = bucket(age as number, table.age_edges);
  const b = bucket(bmi as number, table.bmi_edges);
  const fa = table.age_adj[a], fb = table.bmi_adj[b];
  const raw = table.global_median + fa + fb;
  const band = Math.max(1, Math.min(8, Math.round(raw)));
  const factors = [
    { factor: "age", level: `decile ${a + 1}/10`, adjustment: fa },
    { factor: "bmi", level: `quartile ${b + 1}/4`, adjustment: fb },
  ];
  return {
    band,
    factors,
    explanation: `Scorecard: base band ${Math.round(table.global_median)} age decile ${a + 1}/10 (${fa >= 0 ? "+" : ""}${fa}), BMI quartile ${b + 1}/4 (${fb >= 0 ? "+" : ""}${fb}) = ${raw.toFixed(1)} -> band ${band}/8 (8 = lowest risk).`,
  };
}

// --- Flags ---

export function flagSubmission(row: Row, band: number, stats: { bmi_p90: number; age_p5: number; age_p95: number }): Flag[] {
  const flags: Flag[] = [];
  const age = row["Ins_Age"] as number | null;
  const bmi = row["BMI"] as number | null;
  const medAnswered = MEDICAL_FIELDS.filter((c) => !isMissing(row[c])).length;
  if (!isMissing(bmi) && (bmi as number) >= stats.bmi_p90)
    flags.push({ code: "F1", label: "Build outlier", detail: `BMI ${bmi} at/above corpus 90th percentile (${stats.bmi_p90}).` });
  if (!isMissing(age) && ((age as number) <= stats.age_p5 || (age as number) >= stats.age_p95))
    flags.push({ code: "F2", label: "Age tail", detail: `Ins_Age ${age} outside corpus 5th-95th percentile band.` });
  if (medAnswered < 80)
    flags.push({ code: "F3", label: "Thin medical evidence", detail: `Only ${medAnswered}/89 medical fields answered; underwriting evidence is thin.` });
  if (band <= 3)
    flags.push({ code: "F4", label: "Elevated risk band", detail: `Rated band ${band}/8 (8 = lowest risk) — senior underwriter review required.` });
  return flags;
}

// --- Recommendation ---

export function recommend(
  comp: PacketResult,
  app: { fit_score: number; checks: AppetiteCheck[]; hard_fail: boolean },
  flags: Flag[],
  band: number,
): { action: Action; rationale: string[]; next_steps: string[] } {
  if (app.hard_fail) {
    const failed = app.checks.filter((c) => c.kind === "hard" && !c.passed);
    return {
      action: "DECLINE",
      rationale: ["Hard appetite fail: " + failed.map((c) => `${c.code} — ${c.detail}`).join("; ")],
      next_steps: ["Close the file with the decline letter citing the failed clause(s).", "Offer to revisit if the applicant's circumstances change."],
    };
  }
  if (!comp.is_complete) {
    const top = comp.missing_items.slice(0, 5).map((m) => `${m.label} (${m.field})`).join(", ");
    return {
      action: "REQUEST_INFO",
      rationale: [`Packet ${comp.completeness_pct}% complete — ${comp.missing_count} fields missing, e.g. ${top}`],
      next_steps: ["Send the itemized request list to the client (see memo).", "Hold the file; re-run triage when the packet is complete."],
    };
  }
  if (flags.length > 0 || band <= 4) {
    const rationale: string[] = [];
    if (flags.length) rationale.push("Flagged: " + flags.map((f) => `${f.code} ${f.label}`).join("; "));
    if (band <= 4) rationale.push(`Rated risk band ${band}/8 (8 = lowest risk; quote threshold is band 5).`);
    return {
      action: "REFER_UNDERWRITER",
      rationale,
      next_steps: ["Senior underwriter reviews flags and band evidence.", "Underwriter decides: quote with loading, request more evidence, or decline."],
    };
  }
  return {
    action: "QUOTE",
    rationale: [`Packet complete, appetite fit ${app.fit_score}/100, no flags, risk band ${band}/8 (8 = lowest risk).`],
    next_steps: ["Release to pricing with the rated band.", "Attach the triage memo to the file for audit."],
  };
}

export function draftMemo(
  subId: string, age: number | null, bmi: number | null, medAnswered: number,
  comp: PacketResult,
  app: { fit_score: number; checks: AppetiteCheck[] },
  flags: Flag[],
  band: number, bandExplanation: string,
  rec: { action: Action; rationale: string[]; next_steps: string[] },
): string {
  const lines: string[] = [];
  lines.push(`SUBMISSION TRIAGE MEMO — ${subId}`);
  lines.push(`Applicant profile: age idx ${age}, BMI idx ${bmi}, medical evidence ${medAnswered}/89 fields answered`);
  lines.push(`Recommended action: ${rec.action}`);
  lines.push("");
  lines.push("WHY");
  for (const r of rec.rationale) lines.push(`- ${r}`);
  lines.push("");
  lines.push(`PACKET COMPLETENESS: ${comp.completeness_pct}%`);
  if (comp.missing_items.length) {
    lines.push("Missing items:");
    for (const m of comp.missing_items.slice(0, 12)) lines.push(`  - [${m.document}] ${m.label}: ${m.field}`);
    if (comp.missing_items.length > 12) lines.push(`  ... and ${comp.missing_items.length - 12} more`);
  }
  lines.push("");
  lines.push(`APPETITE FIT: ${app.fit_score}/100`);
  for (const c of app.checks) lines.push(`  [${c.passed ? "PASS" : "FAIL"}] ${c.code} ${c.label}: ${c.detail}`);
  lines.push("");
  lines.push(`RISK BAND: ${band}/8 (8 = lowest risk, 1 = highest risk)`);
  lines.push(`  ${bandExplanation}`);
  if (flags.length) {
    lines.push("");
    lines.push("FLAGS:");
    for (const f of flags) lines.push(`  - ${f.code} ${f.label}: ${f.detail}`);
  }
  lines.push("");
  lines.push("NEXT STEPS (human-gated — nothing is sent automatically)");
  rec.next_steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  lines.push("");
  lines.push("Generated by FirstLook triage (deterministic rules, no LLM). A licensed broker must approve before any client communication.");
  return lines.join("\n");
}

/** Full in-browser triage of one pasted row. */
export function triageRow(
  subId: string, row: Row, table: RatingTable,
  stats: { bmi_p90: number; age_p5: number; age_p95: number },
): Omit<Submission, "source_id" | "true_band" | "mask_applied" | "masked_fields" | "band_cell" | "band_cell_n" | "band_explanation" | "missing_items" | "documents" | "appetite_checks"> & {
  missing_items: Submission["missing_items"]; documents: Submission["documents"];
  appetite_checks: Submission["appetite_checks"]; band_explanation: string; memo: string;
} {
  const comp = auditPacket(row);
  const app = scoreAppetite(row);
  const bandR = predictBand(table, row);
  const flags = flagSubmission(row, bandR.band, stats);
  const rec = recommend(comp, app, flags, bandR.band);
  const medAnswered = MEDICAL_FIELDS.filter((c) => !isMissing(row[c])).length;
  const memo = draftMemo(subId, (row["Ins_Age"] as number) ?? null, (row["BMI"] as number) ?? null, medAnswered, comp, app, flags, bandR.band, bandR.explanation, rec);
  return {
    submission_id: subId,
    age: (row["Ins_Age"] as number) ?? null,
    bmi: (row["BMI"] as number) ?? null,
    med_answered: medAnswered,
    completeness_pct: comp.completeness_pct,
    missing_count: comp.missing_count,
    missing_items: comp.missing_items,
    documents: comp.documents,
    fit_score: app.fit_score,
    appetite_checks: app.checks,
    hard_fail: app.hard_fail,
    risk_band: bandR.band,
    band_explanation: bandR.explanation,
    flags,
    action: rec.action,
    rationale: rec.rationale,
    next_steps: rec.next_steps,
    memo,
  };
}
