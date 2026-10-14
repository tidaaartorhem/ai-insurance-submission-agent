export interface MissingItem {
  document: string;
  label: string;
  field: string;
}

export interface PacketDocument {
  id: string;
  label: string;
  description: string;
  gates_completeness: boolean;
  complete: boolean;
  present: number;
  required: number;
  missing_fields: string[];
}

export interface AppetiteCheck {
  code: string;
  label: string;
  weight: number;
  kind: "hard" | "soft";
  passed: boolean;
  fail_reason: string | null;
  detail: string;
}

export interface Flag {
  code: string;
  label: string;
  detail: string;
}

export interface BandFactor {
  factor: string;
  level: string;
  adjustment: number;
}

export type Action = "QUOTE" | "REQUEST_INFO" | "REFER_UNDERWRITER" | "DECLINE";

export interface Submission {
  submission_id: string;
  source_id: number;
  true_band: number;
  age: number | null;
  bmi: number | null;
  med_answered: number;
  mask_applied: boolean;
  masked_fields: string[];
  completeness_pct: number;
  missing_count: number;
  missing_items: MissingItem[];
  documents: PacketDocument[];
  fit_score: number;
  appetite_checks: AppetiteCheck[];
  hard_fail: boolean;
  risk_band: number;
  band_cell: { age_decile: number; bmi_quartile: number } | null;
  band_cell_n: number;
  band_explanation: string;
  flags: Flag[];
  action: Action;
  rationale: string[];
  next_steps: string[];
  memo: string;
}

export interface Brief {
  generated: string;
  queue_n: number;
  action_mix: Record<string, number>;
  band_agreement_exact: string;
  band_agreement_pct: number;
  mean_completeness: number;
  mean_fit: number;
  headline: string;
}

export interface CorpusStats {
  n: number;
  age_p5: number;
  age_p95: number;
  bmi_p90: number;
  response_dist: Record<string, number>;
}

export interface RatingTable {
  global_median: number;
  age_edges: number[];
  bmi_edges: number[];
  age_adj: number[];
  bmi_adj: number[];
  calibration_n: number;
}

export interface AppetiteSpec {
  clauses: { code: string; label: string; weight: number; kind: string }[];
  bounds: { age_min: number; age_max: number; bmi_max: number };
  note: string;
}

export const ACTION_LABEL: Record<Action, string> = {
  QUOTE: "Ready to quote",
  REQUEST_INFO: "Needs client follow-up",
  REFER_UNDERWRITER: "Underwriter review",
  DECLINE: "Decline",
};

export const ACTION_BLURB: Record<Action, string> = {
  QUOTE: "Packet complete, in appetite, no flags, band 5+. Release to pricing.",
  REQUEST_INFO: "Packet incomplete. The memo lists exactly what to ask the client for.",
  REFER_UNDERWRITER: "Complete but flagged or rated band 4 or below. A human decides.",
  DECLINE: "Hard appetite fail on real evidence. Close the file fast, cite the clause.",
};
