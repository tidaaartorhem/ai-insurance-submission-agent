import React from "react";
import type { Action, Submission } from "../types";
import { ACTION_LABEL } from "../types";

interface Props {
  submissions: Submission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ACTIONS: ("ALL" | Action)[] = ["ALL", "QUOTE", "REQUEST_INFO", "REFER_UNDERWRITER", "DECLINE"];

export default function QueueView({ submissions, selectedId, onSelect }: Props) {
  const [filter, setFilter] = React.useState<"ALL" | Action>("ALL");
  const [sort, setSort] = React.useState<"fit" | "completeness" | "band">("fit");
  const [query, setQuery] = React.useState("");

  const rows = submissions
    .filter((s) => (filter === "ALL" ? true : s.action === filter))
    .filter((s) => (query ? s.submission_id.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) =>
      sort === "fit" ? b.fit_score - a.fit_score
      : sort === "completeness" ? b.completeness_pct - a.completeness_pct
      : b.risk_band - a.risk_band,
    );

  return (
    <div>
      <p className="hint">
        Every new-business submission triaged against the carrier appetite statement, rated on the
        actuarial scorecard, and given one recommended action. Band scale: 8 = lowest risk.
      </p>
      <div className="filters">
        {ACTIONS.map((a) => (
          <button key={a} className={`btn${filter === a ? " primary" : ""}`} onClick={() => setFilter(a)}>
            {a === "ALL" ? `All (${submissions.length})` : `${ACTION_LABEL[a]} (${submissions.filter((s) => s.action === a).length})`}
          </button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value as never)} aria-label="Sort">
          <option value="fit">Sort: appetite fit</option>
          <option value="completeness">Sort: completeness</option>
          <option value="band">Sort: risk band</option>
        </select>
        <input placeholder="Filter by ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <table className="queue-table">
        <thead>
          <tr>
            <th>Submission</th><th>Action</th><th>Packet</th><th>Fit</th><th>Band</th><th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.submission_id} className={s.submission_id === selectedId ? "selected" : ""} onClick={() => onSelect(s.submission_id)}>
              <td><b>{s.submission_id}</b>{s.mask_applied && <span title="As-received missingness injected (seeded, disclosed)"> *</span>}</td>
              <td><span className={`badge ${s.action}`}>{ACTION_LABEL[s.action]}</span></td>
              <td><div className="bar"><div style={{ width: `${s.completeness_pct}%` }} /></div><span className="kv">{s.completeness_pct}%</span></td>
              <td><b>{s.fit_score}</b><span className="kv">/100</span></td>
              <td><b>{s.risk_band}</b><span className="kv">/8</span></td>
              <td>{s.flags.length ? s.flags.map((f) => f.code).join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="gate-note">* Seeded as-received missingness: models real-world incomplete packets (disclosed in README).</p>
    </div>
  );
}
