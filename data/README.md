# Ballast — Data Layer

> **New here?** Start with the top-level [README](../README.md), then [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (modeling & simulation), [docs/DATA_MODEL.md](../docs/DATA_MODEL.md) (every table), and [docs/SCENARIOS.md](../docs/SCENARIOS.md) (the rigged storylines).

The substrate for **Ballast**, the "commercial brain" digital twin for Indian thermal power plants. It synthesizes a realistic, richly-interconnected dataset for **2 plants / 5 units**, shaped as if streaming from three real source systems, so an LLM/agent can answer cross-domain questions like:

> *"BFP-2A vibration is rising — what's my exposure if it trips this week?"*
> → **₹4.76 Cr** (capacity-charge under-recovery + DSM + IEX RTM replacement), with a recommended action.

Everything is reproducible from a fixed seed. No external data.

## Quick start
```bash
pip install -r ../requirements.txt   # numpy, pandas, fpdf2
python3 generate.py               # build ballast.db  (~5s, ~175 MB, ~5.6M rows)
python3 verify.py                 # prove the golden traversal + 15 sanity checks
python3 live_tick.py              # "the twin is alive" — streams live data + fires alerts
python3 live_tick.py --reset      # trim the live tail back to baseline
```

## Files
| File | What |
|---|---|
| `schema.sql` | 27 tables + 4 views. Every table tagged with its real source system + grounding standard. |
| `config.py` | Fleet definition, generation params, and the **golden scenario** knobs. Tune here. |
| `generate.py` | numpy/pandas generator. Vectorized signals, tiered telemetry, rigged scenarios. |
| `verify.py` | Runs the golden query as a cross-system SQL chain + prints PASS/FAIL checks. |
| `live_tick.py` | Real-time simulator: advances the clock, appends 1-min telemetry, escalates alerts. |
| `semantic_layer.json` | The **harness** — table/column/join catalog + ₹ formulas + example Q→SQL for LLM grounding. |
| `ballast.db` | Generated SQLite DB (gitignore-able; regenerate anytime). |
| `build_manuals.py` | Generates the synthetic OEM manuals / O&M docs (`python3 build_manuals.py`). |
| `manuals/*.pdf` | **Unstructured raw data** — 7 grounded manuals (BFP/mill/fan/TG O&M, CBM+ISO-10816 SOP, boiler-tube-leak RCA, master PM schedule). The "why/authority" behind the numbers. Chunking/retrieval is the *intelligence layer*, not built here. |

## Source-system model (the connector story, mocked)
No real connectors are built — but the schema is shaped as if these were already connected. This *is* the architecture slide.

| Source system | Real products | Tables it feeds |
|---|---|---|
| **DCS + Historian** | Emerson Ovation, OSIsoft/AVEVA PI | telemetry, telemetry_1min, condition_monitoring, unit_operating_state, emissions, ambient_weather |
| **CMMS / EAM** | SAP PM, IBM Maximo | equipment, work_orders, outage_events, reliability_metrics, spares_inventory, equipment_spares, purchase_orders |
| **Commercial / Scheduling / Market** | RLDC/SLDC, REMC, IEX/PXIL | commitments, schedule_blocks, commercial_exposure, tariff_components, market_prices, beneficiaries, fuel_stock |
| **Ballast (AI outputs)** | — | failure_predictions, alerts, data_meta |

**The whole thesis:** no single source system can answer the golden query alone. Ballast owns the join.

## Grounded to industry standards
- **ISO 14224** — equipment taxonomy (system/subsystem/equipment_class) + failure-mode/mechanism vocabulary (`equipment`, `failure_modes`)
- **NERC GADS / IEEE 762** — availability/reliability metrics EAF/EFOR/EFORd + outage event classes (`reliability_metrics`, `outage_events`)
- **CERC ABT (Tariff Regs 2024)** — capacity-charge recovery vs NAPAF, DSM (`units.napaf_pct`, `afc_cr_per_year`, `commercial_exposure`)
- **CEA / PAT** — heat rate, PLF, aux consumption, specific coal (`performance_kpi`)
- **CPCB CEMS** — SOx/NOx/SPM/CO₂ emission monitoring (`emissions`)
- **AVEVA/OSIsoft PI** — tag catalog + tiered raw/rollup storage (`process_tags`, `telemetry*`)

## Tiered telemetry (why it's fast *and* realistic)
Mirrors how PI System actually stores data — raw archive + aggregates:
- `telemetry` — **hourly, 90 days, all ~465 tags** → trend charts (~1.0M rows)
- `telemetry_1min` — **1-min, 14 days, ~215 monitored tags** → live twin + vibration zoom (~4.3M rows)
- daily rollups (`performance_kpi`, `commitments`, `commercial_exposure`) → **what the LLM queries** (fast, ~1.5k rows)

The LLM never scans raw telemetry; charts read a single tag's slice via the `(tag_id, ts)` index. Volume never touches query latency.

## Conventions
- High-res `ts` = **INTEGER Unix epoch seconds (UTC)**. IST = `datetime(ts+19800,'unixepoch')`.
- Daily tables use TEXT `date` = `YYYY-MM-DD`. `month` = `YYYY-MM`.
- "Now" = `data_meta['clock_now']` (anchored to **2026-07-04 08:00 IST** — not wall-clock).
- ₹ amounts in rupees; ÷1e7 for crore.

## The golden scenario (rigged deterministically)
**BFP-2A on VSTPS-U3**: vibration ~6.2 mm/s and rising (ISO 10816 danger 7.1), predicted to fail in ~5 days → standby **BFP-2C is out on maintenance** (in-progress WO) → spare thrust bearing **out of stock, 14-day lead**, incoming PO arrives too late → VSTPS-U3 **PAF (85.1%) only 2.1 pts above NAPAF (83%)** so a derating pushes it below → **₹4.76 Cr** projected exposure.

Secondary scenarios (populate other dashboard cards): CSTPS coal stock at 3.4 days (critical), CSTPS-U2 NOx creeping toward limit, VSTPS-U1 Mill-C mild vibration.

## Views (for the UI/LLM)
`v_equipment_health_now`, `v_unit_latest_state`, `v_exposure_90d`, `v_active_alerts`.
