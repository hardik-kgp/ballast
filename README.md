# ⚓ Ballast

**The commercial brain for thermal power plants.** Ballast is a digital-twin intelligence layer that connects a power plant's siloed systems — asset health, maintenance, fuel, and grid commitments — so a single plain-English question returns a **rupee-quantified answer with a recommended action**.

> *"BFP-2A vibration is rising — what's my exposure if it trips this week?"*
> → **₹4.76 Cr** (capacity-charge under-recovery + DSM penalty + IEX replacement power), because the standby pump is down and the spare bearing is out of stock. **Recommendation:** expedite the bearing; pre-emptively derate to protect the grid commitment.

No single system in a plant can answer that today — asset health lives in the historian/CMMS, the money lives in the commercial/scheduling systems. **Ballast owns the join.**

---

## Why this exists

In Indian thermal power, downtime is not a soft "OTIF" score — it's a hard, regulator-defined loss in rupees (CERC Availability-Based Tariff). A unit tripping costs money three ways: lost capacity-charge recovery (PAF below NAPAF), Deviation Settlement Mechanism (DSM) penalties, and buying replacement power on the exchange (IEX) at a premium.

Incumbents (Siemens, GE Vernova, AVEVA, IBM Maximo) stop at *"this asset will probably fail."* Ballast translates that into **₹ commercial exposure** and a **dispatch decision**, and lets operators **run closer to capacity** with confidence. It consumes the incumbents' asset-health signals rather than competing with them.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for positioning and the modeling philosophy in depth.

---

## What's in this repo

This repository currently contains the **data layer** — the realistic, grounded substrate the intelligence layer is built on. It has two halves:

- **Structured** — `data/ballast.db`, a SQLite database of 27 tables + 4 views modelling 2 plants / 5 units, shaped as if streaming from three real source systems.
- **Unstructured** — `data/manuals/*.pdf`, synthetic-but-grounded OEM manuals & O&M documents (the "why/authority" behind the numbers).

Plus a live **real-time simulator** and a **semantic layer** (the harness that grounds an LLM/agent over the data).

```
ballast/
├── README.md                  ← you are here
├── LICENSE                    ← MIT (+ synthetic-data notice)
├── requirements.txt           ← numpy, pandas, fpdf2
├── docs/
│   ├── ARCHITECTURE.md        ← modeling + simulation architecture, source-system model, positioning
│   ├── DATA_MODEL.md          ← every table, column, grain and join documented
│   └── SCENARIOS.md           ← the golden + secondary scenarios, and how to tune them
└── data/
    ├── README.md              ← data-layer quickstart
    ├── schema.sql             ← 27 tables + 4 views, each tagged with source system + standard
    ├── config.py              ← fleet definition + scenario knobs (tune here)
    ├── generate.py            ← the generator (numpy/pandas, fixed seed)
    ├── verify.py              ← golden-traversal proof + 15 integrity checks
    ├── live_tick.py           ← real-time simulator (streams telemetry, fires alerts)
    ├── build_manuals.py       ← generates the synthetic manual PDFs
    ├── semantic_layer.json    ← LLM harness: tables/joins/₹ formulas/example Q→SQL
    ├── manuals/*.pdf          ← 7 grounded manuals (unstructured data)
    └── ballast.db             ← generated (git-ignored; rebuild anytime)
```

---

## Quickstart

```bash
pip install -r requirements.txt
```

**Get the database** — either regenerate it (recommended; deterministic, ~5 s) or download the prebuilt copy:

```bash
# Option A — regenerate from the pinned seed (identical every time)
python3 data/generate.py        # build ballast.db   (~5s, ~175 MB, ~5.5M rows)

# Option B — download the prebuilt DB from the GitHub Release (no Python build)
gh release download v0.1.0-data --repo hardik-kgp/ballast --dir data
```

Then:

```bash
python3 data/verify.py          # prove the golden traversal + 15/15 checks
python3 data/build_manuals.py   # (re)generate the manual PDFs

# watch the twin come alive — BFP-2A vibration climbs, DANGER alert fires:
python3 data/live_tick.py
python3 data/live_tick.py --reset   # trim the live tail back to baseline
```

> The DB is **not** committed to git (it's a 176 MB reproducible artifact). It's shipped as a **[GitHub Release asset](https://github.com/hardik-kgp/ballast/releases/tag/v0.1.0-data)** so the repo stays lean while the data stays one download away.

---

## Architecture at a glance

```
              SOURCE SYSTEMS  (mocked as if already connected)
   ┌───────────────────┬──────────────────┬───────────────────────┐
   │  DCS + Historian  │    CMMS / EAM    │  Commercial / Market   │
   │  Emerson Ovation, │   SAP PM,        │  RLDC/SLDC, REMC,      │
   │  OSIsoft/AVEVA PI │   IBM Maximo      │  IEX / PXIL            │
   └─────────┬─────────┴────────┬─────────┴───────────┬───────────┘
             │                  │                     │
             ▼                  ▼                     ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                 BALLAST DATA LAYER  (this repo)               │
   │  structured   →  ballast.db : 27 tables + 4 views (SQLite)    │
   │  unstructured →  manuals/*.pdf : OEM/O&M documents            │
   │  harness      →  semantic_layer.json : join graph + ₹ formulas│
   │  live         →  live_tick.py : real-time stream + alerts     │
   └───────────────────────────────┬─────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────┐
   │        INTELLIGENCE LAYER  (next)                            │
   │  agent grounds on the DB + retrieves from manuals →          │
   │  cited, widget-rendered answers ("answer = artifact")        │
   └─────────────────────────────────────────────────────────────┘
```

**The thesis in one line:** no single source system can answer the golden query alone; Ballast is the layer that joins asset health → production → grid commitment → rupees, and cites the manual that proves the call.

---

## Grounded to real standards

Nothing is invented; every table maps to an industry standard:

| Standard | What it grounds |
|---|---|
| **ISO 14224** | equipment taxonomy + failure-mode / mechanism vocabulary |
| **NERC GADS / IEEE 762** | availability & reliability metrics (EAF / EFOR / EFORd), outage event classes |
| **CERC ABT (Tariff Regs 2024)** | capacity-charge recovery vs NAPAF, Deviation Settlement Mechanism |
| **CEA / PAT** | performance norms — heat rate, PLF, aux consumption, specific coal |
| **CPCB / MoEF 2015** | CEMS emission limits (SOx / NOx / SPM / CO₂) |
| **AVEVA / OSIsoft PI** | tag catalog + tiered raw/rollup historian storage |

---

## Important: this is synthetic data

All plants, units, equipment, telemetry, commercial figures, and manuals are **synthetic**, generated from a fixed random seed. They are shaped to be realistic and grounded in public standards, but represent **no real plant, company, or proprietary OEM manual**. Rupee figures (AFC, the ₹4.76 Cr projection) are **modeled estimates**, not audited values. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#modeling-caveats) for the full list of modeling assumptions.

---

## Status & roadmap

- ✅ **Data layer** — structured DB + unstructured manuals + live simulator + semantic layer
- ✅ **Intelligence layer** — `server/`: grounded text-to-SQL query service over the DB (semantic layer + DDL grounding, read-only guards, chart suggestions)
- ✅ **App layer** — `app/`: the console (chat with "answer = artifact" widgets, live fleet dashboard, alerts queue)
- ⬜ **Manual retrieval** — cite the OEM/O&M manuals alongside DB answers
