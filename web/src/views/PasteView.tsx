import React from "react";
import { triageRow, type Row } from "../triage";
import type { CorpusStats, RatingTable } from "../types";
import { ACTION_LABEL } from "../types";

const SAMPLE = JSON.stringify({
  Ins_Age: 0.42, Ht: 0.55, Wt: 0.5, BMI: 0.48,
  Product_Info_1: 1, Product_Info_2: "D3", Product_Info_3: 1,
  Product_Info_4: 1, Product_Info_5: 1, Product_Info_6: 1, Product_Info_7: 1,
  Employment_Info_1: 0.1, Employment_Info_2: 1, Employment_Info_3: 1,
  Employment_Info_4: 1, Employment_Info_5: 1, Employment_Info_6: 1,
  Insurance_History_5: 2,
  Medical_History_1: 1,
}, null, 1);

function parseInput(text: string): { row?: Row; error?: string } {
  const t = text.trim();
  if (!t) return { error: "Paste a submission first." };
  try {
    if (t.startsWith("{")) {
      const obj = JSON.parse(t);
      if (typeof obj !== "object" || obj === null) return { error: "Expected a JSON object." };
      return { row: obj as Row };
    }
    // CSV: header row + one data row
    const lines = t.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { error: "CSV needs a header row and one data row." };
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const vals = lines[1].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Row = {};
    headers.forEach((h, i) => {
      const v = vals[i];
      row[h] = v === "" || v === undefined ? null : (isNaN(Number(v)) ? v : Number(v));
    });
    return { row };
  } catch (e) {
    return { error: `Could not parse input: ${(e as Error).message}` };
  }
}

export default function PasteView({ table, stats }: { table: RatingTable | null; stats: CorpusStats | null }) {
  const [text, setText] = React.useState("");
  const [ran, setRan] = React.useState(false);

  const parsed = ran ? parseInput(text) : null;
  const result = parsed?.row && table && stats
    ? triageRow("PASTE-001", parsed.row, table, { bmi_p90: stats.bmi_p90, age_p5: stats.age_p5, age_p95: stats.age_p95 })
    : null;

  return (
    <div>
      <p className="hint">
        Paste one submission as JSON (field names exactly as in the Prudential corpus, e.g.{" "}
        <span className="kv">Ins_Age, BMI, Product_Info_1…</span>) or as a two-line CSV. Missing
        fields are treated as unanswered. The same deterministic rules as the batch pipeline run
        instantly in your browser — no data leaves this page.
      </p>
      <div className="paste-grid">
        <div>
          <textarea className="paste-area" rows={16} value={text}
            onChange={(e) => { setText(e.target.value); setRan(false); }}
            placeholder='{"Ins_Age": 0.42, "BMI": 0.48, ...}' />
          <div className="gate-row">
            <button className="btn primary" onClick={() => setRan(true)}>Run triage</button>
            <button className="btn" onClick={() => { setText(SAMPLE); setRan(false); }}>Load sample</button>
          </div>
          {parsed?.error && <p className="fail" style={{ fontSize: 13 }}>{parsed.error}</p>}
        </div>
        <div>
          {!result && <p className="hint">Results appear here.</p>}
          {result && (
            <div className="panel">
              <h3>Result — <span className={`badge ${result.action}`}>{ACTION_LABEL[result.action]}</span></h3>
              <div className="check-row"><span>Packet completeness</span><span><b>{result.completeness_pct}%</b></span></div>
              <div className="check-row"><span>Appetite fit</span><span><b>{result.fit_score}/100</b></span></div>
              <div className="check-row"><span>Risk band</span><span><b>{result.risk_band}/8</b> <span className="kv">(8 = lowest risk)</span></span></div>
              <div className="check-row"><span>Flags</span><span>{result.flags.length ? result.flags.map((f) => `${f.code} ${f.label}`).join("; ") : "none"}</span></div>
              {result.rationale.map((r, i) => <p className="kv" key={i}>• {r}</p>)}
              <h3 style={{ marginTop: 10 }}>Memo draft</h3>
              <div className="memo" style={{ maxHeight: 300 }}>{result.memo}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
