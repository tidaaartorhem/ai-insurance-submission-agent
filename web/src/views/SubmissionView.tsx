import React from "react";
import type { Submission } from "../types";
import { ACTION_BLURB, ACTION_LABEL } from "../types";

export default function SubmissionView({ s, onBack }: { s: Submission; onBack: () => void }) {
  const [gate, setGate] = React.useState<string | null>(null);

  return (
    <div>
      <button className="back-link" onClick={onBack}>← Back to queue</button>
      <div className="header" style={{ padding: "12px 0" }}>
        <h1 style={{ fontSize: 24 }}>{s.submission_id} <span className={`badge ${s.action}`}>{ACTION_LABEL[s.action]}</span></h1>
        <p className="tagline">{ACTION_BLURB[s.action]}</p>
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="num">{s.completeness_pct}%</div><div className="lbl">packet complete</div></div>
        <div className="stat-card"><div className="num">{s.fit_score}<span style={{ fontSize: 14 }}>/100</span></div><div className="lbl">appetite fit</div></div>
        <div className="stat-card"><div className="num">{s.risk_band}<span style={{ fontSize: 14 }}>/8</span></div><div className="lbl">risk band (8 = lowest risk)</div></div>
        <div className="stat-card"><div className="num">{s.flags.length}</div><div className="lbl">flags</div></div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h3>Packet completeness</h3>
          {s.documents.map((d) => (
            <div className="check-row" key={d.id}>
              <span><b>{d.id}</b> {d.label}{d.gates_completeness ? "" : <span className="kv"> (risk input)</span>}<br />
                <span className="kv">{d.present}/{d.required} fields{d.missing_fields.length ? ` — missing: ${d.missing_fields.slice(0, 4).join(", ")}${d.missing_fields.length > 4 ? ` +${d.missing_fields.length - 4}` : ""}` : ""}</span>
              </span>
              <span className={d.complete ? "pass" : "fail"}>{d.complete ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Appetite fit — {s.fit_score}/100</h3>
          {s.appetite_checks.map((c) => (
            <div className="check-row" key={c.code}>
              <span><b>{c.code}</b> {c.label} <span className="kv">({c.weight} pts{c.kind === "hard" ? ", hard stop" : ""})</span><br />
                <span className="kv">{c.detail}</span></span>
              <span className={c.passed ? "pass" : "fail"}>{c.passed ? "PASS" : "FAIL"}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Risk band — {s.risk_band}/8</h3>
          <p className="kv">{s.band_explanation}</p>
          <p className="kv">Calibrated on <b>{s.band_cell_n.toLocaleString()}</b> real applicant records.
            True Prudential band for this applicant: <b>{s.true_band}/8</b>.</p>
          {s.flags.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Flags</h3>
              {s.flags.map((f) => (
                <div className="check-row" key={f.code}>
                  <span><b>{f.code}</b> {f.label}<br /><span className="kv">{f.detail}</span></span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="panel">
          <h3>Why this action</h3>
          {s.rationale.map((r, i) => <p className="kv" key={i}>• {r}</p>)}
          <h3 style={{ marginTop: 12 }}>Next steps</h3>
          {s.next_steps.map((n, i) => <p className="kv" key={i}>{i + 1}. {n}</p>)}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Triage memo (draft — human-gated)</h3>
        <div className="memo">{s.memo}</div>
        <div className="gate-row">
          <button className="btn primary" disabled={gate !== null} onClick={() => setGate("approved")}>Approve action</button>
          <button className="btn" disabled={gate !== null} onClick={() => setGate("sent-back")}>Send back for rework</button>
        </div>
        {gate === null
          ? <p className="gate-note">Nothing is sent anywhere. Approving only records a local decision on this demo file.</p>
          : <p className="gate-note">✓ Recorded locally: <b>{gate === "approved" ? "action approved" : "sent back for rework"}</b> by the reviewer. (Demo state only — no external effect.)</p>}
      </div>
    </div>
  );
}
