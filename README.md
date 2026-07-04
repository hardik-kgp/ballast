# ⚓ Ballast — Runbook

**The commercial brain for thermal power plants.** Ballast joins a plant's siloed systems (asset health, maintenance, fuel, grid commitments) so a plain-English question returns a rupee-quantified answer with a recommended action, rendered as a chart artifact.

This README is the runbook: clone → run → ask. For the product story and modeling depth see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/SCENARIOS.md](docs/SCENARIOS.md), and [data/README.md](data/README.md).

---

## What runs where

| Piece | Path | Port | What it is |
|---|---|---|---|
| Data layer | `data/` | - | SQLite `ballast.db` (27 tables + 4 views, ~5.6M rows) + OEM manual PDFs |
| Query service | `server/` | 8077 | FastAPI: LLM text-to-SQL over the DB, read-only, returns answer + chart spec |
| Console app | `app/` | 5177 | Vite/React: chat with artifacts, live fleet dashboard, alerts queue |

No Docker and no database server needed — SQLite is embedded, everything runs as local processes.

## Prerequisites

- Python 3.11+ (`pip` on PATH)
- Node 18+ (`npm` on PATH)
- An **OpenRouter API key** (the only external dependency; used for the chat LLM)

## 1. Configure the .env

Create a file named `.env` in the **repo root** (this folder, next to this README). It is git-ignored. One line is required:

```env
OPENROUTER_API_KEY=sk-or-...
```

Optional override (defaults to `openai/gpt-5.4`):

```env
BALLAST_LLM_MODEL=openai/gpt-5.4
```

## 2. Build the database (one time, ~2 min)

```bash
pip install -r requirements.txt
python data/generate.py              # builds data/ballast.db (~175 MB, fixed seed, deterministic)
python data/verify.py                # optional: proves the golden traversal, 15/15 checks
python -X utf8 app/scripts/export_feed.py   # writes app/src/data/feed.json for the dashboard
```

> Windows note: use `python -X utf8` for scripts that print the ₹ symbol, otherwise the console codec may choke. If `generate.py` fails on epoch math, confirm `pandas<3` is installed (pinned in `requirements.txt`).

## 3. Start the query service

```bash
cd server
pip install -r requirements.txt
python run_local.py --env-file ../.env --port 8077
```

Check it: `http://localhost:8077/healthz` should report `"status": "ok"` and the model name.

## 4. Start the console

```bash
cd app
npm install
npm run dev
```

Open **http://localhost:5177**. The app proxies `/api` to the query service, so chat answers are live SQL over `ballast.db`.

## 5. Optional: make the twin tick

```bash
python data/live_tick.py             # streams 1-min telemetry, advances the clock, escalates alerts
python data/live_tick.py --reset     # trim the live tail back to baseline
python -X utf8 app/scripts/export_feed.py   # re-export so the dashboard picks up the new state
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chat says "query service did not answer" | Start step 3; confirm `/healthz` returns ok |
| `503 OPENROUTER_API_KEY is not configured` | `.env` missing/misnamed key, or wrong `--env-file` path |
| `UnicodeEncodeError ... '\u20b9'` on Windows | Run the script with `python -X utf8` |
| `UNIQUE constraint failed: telemetry_1min...` in generate | `pip install "pandas>=2.0,<3"` and regenerate |
| Dashboard shows stale numbers after regenerating the DB | Re-run `app/scripts/export_feed.py`, then hard-refresh |
| Port 5177 or 8077 already in use | Pass `--port` to `run_local.py` / edit `app/vite.config.ts` proxy target together |

---

## 10 most impactful questions to ask the chat

These exercise the cross-system joins no single plant system can answer alone. The first one is the golden scenario.

1. **"BFP-2A vibration is rising — what is my exposure if it trips this week?"** — health → standby down → spare stockout → PAF margin → **₹4.76 Cr**.
2. **"Which equipment is closest to failure and what is the rupee exposure if it trips?"** — fleet-wide health ranking joined to failure predictions.
3. **"Does BFP-2A have a healthy standby, and is the spare bearing in stock?"** — redundancy + CMMS work orders + inventory + PO ETA in one answer.
4. **"Show the PAF vs NAPAF trend for VSTPS-U3 over the last 30 days."** — how thin the availability margin above the capacity-charge floor really is.
5. **"How much have we lost to unplanned outages in the last 90 days, by unit?"** — the ₹ leak split into capacity charge lost, DSM, and RTM replacement.
6. **"How much money did we lose to DSM penalties per month, by unit?"** — schedule-discipline trend, the recurring bleed.
7. **"What is replacement power costing on the exchange right now vs the evening peak?"** — DAM/RTM price curves; why an unplanned trip buys at the worst hours.
8. **"Coal stock status by plant — who is below the 4-day critical line?"** — CSTPS at 3.4 days; derating risk before it happens.
9. **"Which units are trending toward a CPCB emission limit?"** — NOx creep vs the 300 mg/Nm³ stack limit.
10. **"Which unit had the worst heat rate deviation last week and what is that costing in extra coal?"** — efficiency drift translated into fuel money.

---

## Repo map

```
ballast/
├── README.md              ← this runbook
├── .env                   ← you create this (git-ignored): OPENROUTER_API_KEY
├── requirements.txt       ← data-layer deps (numpy, pandas<3, fpdf2)
├── data/                  ← schema, generator, verifier, live simulator, semantic layer, manuals
├── server/                ← FastAPI query service (LLM text-to-SQL, read-only guards)
├── app/                   ← Vite/React console (chat + dashboard + alerts)
└── docs/                  ← architecture, data model, scenarios
```

## Status

- ✅ Data layer — structured DB + manuals + live simulator + semantic layer
- ✅ Intelligence layer — grounded text-to-SQL query service (`server/`)
- ✅ App layer — console with "answer = artifact" chat, live dashboard, alerts (`app/`)
- ⬜ Manual retrieval — cite the OEM/O&M PDFs alongside DB answers
- ⬜ Chat streaming — token-by-token SSE responses

## Synthetic-data notice

All plants, units, telemetry, commercial figures, and manuals are synthetic, generated from a fixed seed, grounded in public standards (ISO 14224, NERC GADS/IEEE 762, CERC ABT 2024, CEA/PAT, CPCB). They represent no real plant or proprietary document. MIT licensed — see [LICENSE](LICENSE).
