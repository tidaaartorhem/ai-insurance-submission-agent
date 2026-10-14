# FirstLook — the new-business triage board for insurance brokerages

**The problem.** Every morning, an insurance brokerage's inbox fills with new-business submissions: applications, identity documents, employment evidence, prior-coverage history. A senior broker burns hours on each file just answering three questions: *is the packet complete, does it fit our appetite, and what should happen next?* Roughly half of submissions arrive missing something (in the real data below: prior-coverage detail missing in 43% of files, an employment field missing in 18%), and about 1 in 10 fail the carrier's appetite outright — but those files still consume the same expensive first look as the clean ones.

**The automation.** FirstLook runs every submission through a deterministic triage pipeline and returns **one recommended action** — QUOTE, REQUEST_INFO, REFER_UNDERWRITER, or DECLINE — with cited rationale and a human-gated memo draft. Nothing is ever sent automatically; the memo is the artifact a licensed broker approves.

**Live demo:** https://ai-insurance-submission-agent.web.app

## How it works

1. **Packet audit** — five gated documents (application, identity, demographics, employment, prior coverage) must be fully present. Medical/family disclosure sections are *risk inputs, not gates*: a healthy applicant truthfully discloses nothing.
2. **Appetite fit** — a seeded carrier appetite statement (disclosed below): hard stops on age (APP-1) and BMI (APP-2) decline on *evidence only*, never on missing fields; soft preferences score 0–100.
3. **Risk band** — a transparent additive scorecard (base band + observed median shifts by age decile and BMI quartile), calibrated on 47,457 real applicant records. Every rating cites its factors.
4. **Flags** — F1 build outlier, F2 age tail, F3 thin medical evidence, F4 elevated risk band. Flags route to a human underwriter.
5. **One action + memo** — deterministic routing with a draft triage memo behind a human gate.

## Real data

Calibrated on **59,381 real applicant records** from the [Prudential Life Insurance Assessment](https://www.kaggle.com/c/prudential-life-insurance-assessment) corpus (Kaggle): product, demographic, employment, insurance-history, family-history and medical-history fields with the ordinal risk Response (1–8, **8 = lowest risk**).

Only the documented continuous fields (age, height, weight, BMI) carry real-world meaning. All other groups are anonymized in the source; the pipeline treats them as answered-field counts and **never invents semantics** for them.

The 180-file demo queue is a seeded random sample of a held-out 20% slice. To model real-world as-received packets, a seeded, disclosed mask drops field groups from ~30% of queue files (marked `*` in the UI).

## Seeded appetite statement (disclosed)

| Code | Clause | Weight | Kind |
|------|--------|--------|------|
| APP-1 | Applicant age within [0.10, 0.80] (normalized) | 30 | hard |
| APP-2 | BMI at or below 0.70 (normalized) | 30 | hard |
| APP-3 | Preferred build, BMI ≤ 0.55 | 15 | soft |
| APP-4 | Preferred age band [0.20, 0.65] | 15 | soft |
| APP-5 | Medical evidence fully answered (89/89) | 10 | soft |

## Honest eval

- **Scorecard, held-out n=11,924:** exact band agreement 32.8%, within-1 agreement **60.9%**. It is a blunt, auditable rating manual — not a black-box classifier — and it says so in the UI.
- **Routing logic, 10 hand-built edge cases:** 10/10 (clean→QUOTE, missing docs→REQUEST_INFO, appetite evidence→DECLINE, flags/low band→REFER_UNDERWRITER).
- **Tests:** 20/20 pytest (pipeline) + 13/13 vitest (in-browser rule mirror) green.

## Reproduce

```bash
curl -sL -o data/train.csv https://raw.githubusercontent.com/ningningliu/Prudential-Life-Insurance-Assessment/master/data/train.csv
PYTHONPATH=. python scripts/build_outputs.py   # regenerates web/public/data/*.json
python -m pytest tests/ -q                     # 20/20 green
cd web && npm install && npm test && npm run build
```

## Project layout

```
services/       # deterministic pipeline: schema, packet, appetite, riskband, flags, action, memo
scripts/        # build_outputs.py (corpus -> frontend JSON), eval.py (held-out + golden-set eval)
tests/          # 20 pytest tests
web/            # React + TypeScript frontend (Vite); src/triage.ts mirrors the Python rules in-browser
data/           # DATA_NOTE.md (raw CSV is 20 MB, downloaded not committed)
```

## Language mix

Real Python service layer (ingestion, calibration, scoring, eval — pandas/numpy) + TypeScript/React frontend with an in-browser mirror of the scoring rules. Both do real work; neither is filler.
