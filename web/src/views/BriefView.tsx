import type { Brief, CorpusStats, Submission } from "../types";
import { ACTION_LABEL } from "../types";

function hist(values: number[], bins: number, min: number, max: number) {
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * bins)));
    counts[i]++;
  }
  return counts;
}

export default function BriefView({ brief, stats, submissions }: { brief: Brief; stats: CorpusStats; submissions: Submission[] }) {
  const bandCounts = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (b) => submissions.filter((s) => s.risk_band === b).length,
  );
  const compHist = hist(submissions.map((s) => s.completeness_pct), 10, 0, 100);
  const maxBand = Math.max(...bandCounts, 1);
  const maxComp = Math.max(...compHist, 1);
  const declineReasons: Record<string, number> = {};
  for (const s of submissions.filter((x) => x.action === "DECLINE")) {
    for (const c of s.appetite_checks.filter((x) => x.kind === "hard" && !x.passed))
      declineReasons[c.code] = (declineReasons[c.code] || 0) + 1;
  }
  const topMissing: Record<string, number> = {};
  for (const s of submissions) for (const m of s.missing_items) {
    const k = `${m.document} ${m.label}`;
    topMissing[k] = (topMissing[k] || 0) + 1;
  }

  return (
    <div>
      <p className="hint">The 9:15 AM brief: what landed in the inbox, what the desk did with it, and where the day goes.</p>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Headline</h3>
        <p style={{ fontSize: 16, margin: "4px 0" }}>{brief.headline}</p>
        <p className="kv">Mean packet completeness <b>{brief.mean_completeness}%</b> · mean appetite fit <b>{brief.mean_fit}/100</b> ·
          scorecard exact band agreement on this queue <b>{brief.band_agreement_pct}%</b> ({brief.band_agreement_exact}) ·
          calibrated on <b>{stats.n.toLocaleString()}</b> real applicant records.</p>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <h3>Action mix</h3>
          {Object.entries(brief.action_mix).map(([a, n]) => (
            <div className="check-row" key={a}>
              <span>{ACTION_LABEL[a as keyof typeof ACTION_LABEL]}</span>
              <span><b>{n}</b><span className="kv"> ({Math.round((100 * n) / brief.queue_n)}%)</span></span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Top decline reasons (hard appetite fails)</h3>
          {Object.entries(declineReasons).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
            <div className="check-row" key={code}><span><b>{code}</b></span><span><b>{n}</b> files</span></div>
          )) || <p className="kv">None.</p>}
          <h3 style={{ marginTop: 12 }}>Most-missing packet items</h3>
          {Object.entries(topMissing).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => (
            <div className="check-row" key={k}><span>{k}</span><span><b>{n}</b> files</span></div>
          ))}
        </div>
        <div className="panel">
          <h3>Rated band distribution (8 = lowest risk)</h3>
          <div className="hist">{bandCounts.map((c, i) => <div key={i} className="h" style={{ height: `${Math.max(4, (100 * c) / maxBand)}%` }} title={`Band ${i + 1}: ${c}`} />)}</div>
          <div className="hist-lbls">{[1, 2, 3, 4, 5, 6, 7, 8].map((b) => <span key={b}>{b}</span>)}</div>
        </div>
        <div className="panel">
          <h3>Packet completeness distribution</h3>
          <div className="hist">{compHist.map((c, i) => <div key={i} className="h" style={{ height: `${Math.max(4, (100 * c) / maxComp)}%` }} title={`${i * 10}-${i * 10 + 10}%: ${c}`} />)}</div>
          <div className="hist-lbls">{compHist.map((_, i) => <span key={i}>{i * 10}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
