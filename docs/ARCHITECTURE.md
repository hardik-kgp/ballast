# Ballast — Modeling & Simulation Architecture

This document explains **how the data layer is designed and why** — the source-system model, the simulation approach, the tiered telemetry, the golden-scenario rigging, and the modeling assumptions. Read [DATA_MODEL.md](DATA_MODEL.md) for the exhaustive table reference and [SCENARIOS.md](SCENARIOS.md) for the rigged storylines.

---

## 1. Product positioning (why the data is shaped this way)

Ballast is positioned as the **"commercial brain on top of asset health"**, not another predictive-maintenance engine (that market is crowded — Siemens ~13.5% share, GE Vernova, AspenTech, IBM Maximo APM, AVEVA). The two seams Ballast owns:

1. **Asset-health → ₹ commercial-exposure translation.** A failing pump becomes "₹X of capacity-charge under-recovery + DSM penalty + IEX replacement power."
2. **Run closer to capacity.** Confident health data lets a plant declare higher capacity (higher DC → higher PAF → more fixed-cost recovery) without adding trip risk.

Because of this, the data layer is deliberately built to make **cross-domain joins** possible and dramatic: asset condition, redundancy, spares, fuel, availability, and rupees all live in one substrate with clean foreign keys. The incumbents' asset-health outputs are modeled as an *upstream source* (`condition_monitoring`), not a competitor.

---

## 2. The source-system model

Every table is tagged (in `schema.sql` comments and `semantic_layer.json`) with the **real source system** it would stream from in production. No connectors are actually built — but the schema is shaped as if three systems + one historian were already integrated. This *is* the connector/architecture story:

| Tag | Real-world system | Real products | Tables it feeds |
|---|---|---|---|
| **DCS/HIST** | Distributed Control System + Historian | Emerson Ovation, Siemens SPPA-T3000, ABB Symphony Plus, OSIsoft/AVEVA PI | `telemetry`, `telemetry_1min`, `condition_monitoring`, `unit_operating_state`, `emissions`, `ambient_weather` |
| **CMMS** | Maintenance / Enterprise Asset Management | SAP PM, IBM Maximo, Infor EAM | `equipment`, `failure_modes`, `work_orders`, `outage_events`, `reliability_metrics`, `spares_inventory`, `equipment_spares`, `purchase_orders` |
| **COMM** | Commercial / Scheduling / Market | RLDC/SLDC/NLDC, REMC, IEX/PXIL | `commitments`, `schedule_blocks`, `commercial_exposure`, `tariff_components`, `market_prices`, `beneficiaries`, `fuel_stock` |
| **BALLAST** | Ballast's own AI/agentic outputs | — | `failure_predictions`, `alerts`, `data_meta` |

**Key insight:** the golden query traverses all three source systems in one answer — something no single system can do. That traversal is the product.

---

## 3. Simulation approach

### 3.1 Reproducibility
Everything derives from a single seed (`config.SEED = 42`) and a **fixed anchor time** (`config.ANCHOR_IST = 2026-07-04 08:00 IST`) — never wall-clock — so every run produces byte-identical data. `data_meta.clock_now` stores the anchor as the "current time" pointer the UI reads.

### 3.2 Signal synthesis (top-down from load)
Rather than model thermodynamics, signals are synthesized top-down for plausibility and speed:

1. **Per-unit load profile** (`unit_load_frac`) — an hourly fraction over 90 days = base PLF + diurnal sine + evening peak + weekend dip + noise, clipped to `[0.5, 1.0]`, with planted historical outage windows zeroing/reducing load.
2. **Derived tags** — each process/condition tag is generated as `base + gain × load_fraction + gaussian_noise`, with per-`param_type` bases, gains, and noise (see `TAG_SPECS` in `generate.py`). Supercritical units shift steam-temperature bases *and* alarm limits up together.
3. **Degradation overlays** — planted-degradation equipment (the golden BFP-2A, the secondary Mill-C) get an accelerating ramp `base + (now − base) × frac^2.2` on vibration and a coupled bearing-temperature rise. `health_index` is derived from vibration (vs ISO 10816 zones) and bearing temperature.
4. **Rollups** — daily KPIs, commitments, and commercial exposure are aggregated from the load/availability, applying the CERC formulas.

### 3.3 Time base & storage convention
- High-volume time-series `ts` = **INTEGER Unix epoch seconds (UTC)** — compact and fast for range scans. IST = `datetime(ts + 19800, 'unixepoch')`.
- Daily/reference tables use **TEXT ISO** `date` = `YYYY-MM-DD` and `month` = `YYYY-MM` — easy for an LLM to read.

---

## 4. Tiered telemetry (fast *and* realistic)

A real 500 MW unit runs 15,000–80,000 historian tags at sub-second resolution — hundreds of millions of rows if stored raw. That would make the DB multi-GB and the demo crawl. Instead, Ballast mirrors how **PI System actually stores data** — a raw archive plus aggregates:

| Table | Resolution / window | Purpose | ~Rows |
|---|---|---|---|
| `telemetry_1min` | 1-minute, last **14 days**, ~215 monitored tags | live twin + vibration zoom | ~4.3M |
| `telemetry` | hourly, full **90 days**, all ~465 tags | trend charts | ~1.0M |
| `condition_monitoring` | hourly, 90 days, ~105 assets | health/vibration rollup | ~0.2M |
| daily rollups | daily, 90 days | **what the LLM queries** | ~1.5k |

**The LLM never scans raw telemetry.** KPIs and rupees come from the tiny daily rollups (instant); charts read a single tag's slice via the `(tag_id, ts)` primary key (also instant). Raw volume never touches query latency — it exists purely to look production-real and to power zoomable charts. Total DB ≈ 175 MB, generates in ~5 s.

---

## 5. The unstructured layer (manuals)

The structured DB knows `vibration = 6.2 mm/s`. It does **not** know *why that's bad* — that 4.5 is the alarm, 7.1 is the ISO 10816 danger threshold for this machine class, and the thrust bearing is due at 8,000 running hours. That "why + authority" lives in **OEM manuals and O&M binders**, and it's what makes a recommendation trustworthy instead of a guess.

`build_manuals.py` generates 7 grounded PDF documents (`data/manuals/`) whose numbers are **cross-consistent with the DB** (alarm/danger limits, bearing temps, service intervals, ISO 14224 failure modes). Real OEM/ISO PDFs are copyrighted and not redistributable, so these are clearly-labelled **synthetic** documents grounded in public standards.

> **Architectural boundary:** raw documents are *data*. Chunking, embedding, and retrieval belong to the **intelligence layer** built on top — they are intentionally **not** part of this data layer.

---

## 6. Real-time simulation

`live_tick.py` reproduces the *effect* of a live plant without streaming infrastructure. In production this is OPC-UA/MQTT from the DCS → PI historian → Ballast ingestion. For the demo, each tick advances `clock_now`, appends fresh 1-minute rows for all monitored tags (charts move), and escalates alerts as thresholds cross. It is **scripted for the stage**: BFP-2A's vibration keeps climbing toward the ISO 10816 danger line (7.1 mm/s), and when it crosses, Ballast fires a DANGER alert live. `--reset` trims the appended tail so the demo is repeatable.

---

## 7. Scripts & data flow

```
config.py ──────────────┐  (fleet, scenario knobs, seed, time base)
                        ▼
schema.sql ──►  generate.py  ──►  ballast.db  ──►  verify.py   (golden traversal + 15 checks)
                        │                     └──►  live_tick.py (real-time stream)
                        │
build_manuals.py ──►  manuals/*.pdf
semantic_layer.json ──────────────────────────►  (consumed by the intelligence layer)
```

| Script | Role |
|---|---|
| `config.py` | Single source of truth for the fleet, generation parameters, and the golden/secondary scenario knobs. |
| `generate.py` | Reads `config.py` + `schema.sql`, synthesizes all data, writes `ballast.db`, builds the 4 views, prints a row-count summary. |
| `verify.py` | Runs the golden query as a cross-system SQL chain and asserts 15 factual + integrity checks. Exit code 0 = all pass. |
| `live_tick.py` | Real-time simulator; `--reset` to restore baseline. |
| `build_manuals.py` | Generates the synthetic manual PDFs (fpdf2). |
| `semantic_layer.json` | The harness: table/column/join catalog + ₹ formulas + example Q→SQL, so an LLM writes correct SQL and never hallucinates structure. |

---

## 8. Modeling caveats {#modeling-caveats}

These are deliberate, defensible simplifications — call them out honestly when presenting:

- **Rupee magnitudes are modeled, not audited.** AFC values and the ₹4.76 Cr projection are plausible estimates; present them as *"Ballast estimates,"* which is what an agent would output.
- **Capacity-charge formula is simplified.** We use "full recovery when PAF ≥ NAPAF, pro-rated below" rather than the exact CERC `AFC × 0.5 × (NDM/NDY) × (PAFM/NAPAF)`. The grounded fact — PAF below NAPAF causes proportional under-recovery — holds.
- **Planned outages don't book capacity-charge loss.** NAPAF already accounts for planned maintenance, so only forced/derating availability losses accrue rupees. This keeps the "avoidable loss" story honest.
- **Station heat rate is normative *gross*** (efficient, ~2300–2550 kcal/kWh), not the ~3149 kcal/kWh national *net* average that includes older plants.
- **Emission norms** use the CPCB/MoEF 2015 basis for units commissioned 2004–2016 (NOx 300, SO₂ 600, SPM 50 mg/Nm³); the fleet is dated accordingly so one norm applies uniformly.
- **Signals are phenomenological, not physical** — synthesized for plausibility and demo drama, not solved from first-principles thermodynamics.
