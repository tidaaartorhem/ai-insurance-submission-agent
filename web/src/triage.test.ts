import { describe, expect, it } from "vitest";
import {
  auditPacket, scoreAppetite, predictBand, recommend, triageRow,
  GROUPS, type Row,
} from "./triage";
import type { RatingTable } from "./types";

const TABLE: RatingTable = {
  global_median: 6,
  age_edges: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, Infinity],
  bmi_edges: [0, 0.25, 0.5, 0.75, Infinity],
  age_adj: [1, 1, 1, 1, 0, 0, 0, 0, 0, -1],
  bmi_adj: [2, 1, 0, -1],
  calibration_n: 47457,
};

const STATS = { bmi_p90: 0.7, age_p5: 0.05, age_p95: 0.95 };

function fullRow(): Row {
  const row: Row = {};
  for (const cols of Object.values(GROUPS)) for (const c of cols) row[c] = 1;
  row["Ins_Age"] = 0.4; row["Ht"] = 0.5; row["Wt"] = 0.5; row["BMI"] = 0.45;
  for (let i = 1; i <= 48; i++) row[`Medical_Keyword_${i}`] = 0;
  for (let i = 1; i <= 5; i++) row[`Family_Hist_${i}`] = 3;
  return row;
}

describe("auditPacket (browser mirror)", () => {
  it("scores a complete packet at 100%", () => {
    const c = auditPacket(fullRow());
    expect(c.is_complete).toBe(true);
    expect(c.completeness_pct).toBe(100);
  });
  it("lists missing gated fields", () => {
    const row = fullRow();
    row["Insurance_History_5"] = null;
    const c = auditPacket(row);
    expect(c.is_complete).toBe(false);
    expect(c.missing_items[0].field).toBe("Insurance_History_5");
  });
  it("does not gate disclosure sections", () => {
    const row = fullRow();
    for (let i = 1; i <= 41; i++) row[`Medical_History_${i}`] = null;
    expect(auditPacket(row).is_complete).toBe(true);
  });
});

describe("scoreAppetite (browser mirror)", () => {
  it("gives a clean row 100 with no hard fail", () => {
    const a = scoreAppetite(fullRow());
    expect(a.fit_score).toBe(100);
    expect(a.hard_fail).toBe(false);
  });
  it("hard-fails BMI over the ceiling on evidence", () => {
    const a = scoreAppetite({ ...fullRow(), BMI: 0.85 });
    expect(a.hard_fail).toBe(true);
  });
  it("never hard-fails on missing fields", () => {
    const row = fullRow();
    row["Ins_Age"] = null;
    expect(scoreAppetite(row).hard_fail).toBe(false);
  });
});

describe("predictBand (browser mirror)", () => {
  it("applies the scorecard math", () => {
    // age 0.45 -> decile 5 (adj 0); BMI 0.3 -> quartile 2 (adj +1) => band 7
    const r = predictBand(TABLE, { Ins_Age: 0.45, BMI: 0.3 });
    expect(r.band).toBe(7);
    expect(r.factors).toHaveLength(2);
  });
  it("falls back to the median when age/BMI are missing", () => {
    expect(predictBand(TABLE, { Ins_Age: null, BMI: 0.3 }).band).toBe(6);
  });
});

describe("recommend (browser mirror)", () => {
  it("routes clean + band 6 to QUOTE", () => {
    const row = fullRow();
    const rec = recommend(auditPacket(row), scoreAppetite(row), [], 6);
    expect(rec.action).toBe("QUOTE");
  });
  it("routes incomplete packets to REQUEST_INFO", () => {
    const row = fullRow();
    row["BMI"] = null;
    const rec = recommend(auditPacket(row), scoreAppetite(row), [], 6);
    expect(rec.action).toBe("REQUEST_INFO");
  });
  it("routes hard appetite fails to DECLINE", () => {
    const row = { ...fullRow(), BMI: 0.9 };
    const rec = recommend(auditPacket(row), scoreAppetite(row), [], 2);
    expect(rec.action).toBe("DECLINE");
  });
  it("routes flagged files to REFER_UNDERWRITER", () => {
    const row = fullRow();
    const rec = recommend(auditPacket(row), scoreAppetite(row),
      [{ code: "F1", label: "x", detail: "y" }], 6);
    expect(rec.action).toBe("REFER_UNDERWRITER");
  });
});

describe("triageRow (end to end)", () => {
  it("produces a memo for a pasted row", () => {
    const out = triageRow("PASTE-1", fullRow(), TABLE, STATS);
    expect(out.action).toBe("QUOTE");
    expect(out.memo).toContain("PASTE-1");
    expect(out.memo).toContain("human-gated");
  });
});
