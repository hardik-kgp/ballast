# Ballast — Rigged Scenarios

The data isn't uniformly random. A handful of storylines are **deliberately planted** so that cross-domain queries resolve into dramatic, specific, rupee-quantified answers. Everything else is plausibly random. All knobs live in `data/config.py` (`GOLDEN` and `SECONDARY`).

Reverse-engineer the demo questions first, then rig the data so each resolves perfectly — that's the technique. Run `python3 data/verify.py` to watch the golden traversal play out and confirm 15/15 integrity checks.

---

## 🥇 The golden scenario — Boiler Feed Pump 2A (VSTPS-U3)

**The question:** *"BFP-2A vibration is rising — what's my exposure if it trips this week?"*

**The one-answer traversal (crosses all three source systems):**

| Step | Source system | Finding (in the data) |
|---|---|---|
| 1. Condition | DCS/HIST + BALLAST | `condition_monitoring` / `failure_predictions`: BFP-2A vibration ≈ **6.2 mm/s** and rising (ISO 10816 alert 4.5, danger 7.1); health ≈ 34/100; predicted failure in **~5 days**, 87% confidence |
| 2. Redundancy | CMMS | `equipment.standby_equip_id` → BFP-2C is the standby, but `work_orders` shows BFP-2C on an **in-progress breakdown WO** → no healthy standby |
| 3. Spares | CMMS/ERP | `equipment_spares` → `spares_inventory`: thrust bearing `SP-BRG-BFP-THR` **out of stock**, 14-day lead; `purchase_orders` PO-2026-3391 ETA ~12 days → **too late** |
| 4. Availability margin | COMM | `units.napaf_pct` = 83; `performance_kpi.paf` ≈ **85.1%** → only ~2 pts of headroom, so a derating pushes PAF **below** NAPAF |
| 5. ₹ exposure | BALLAST over COMM | `failure_predictions.rupees_at_risk` ≈ **₹4.76 Cr** = capacity-charge under-recovery + DSM penalty + IEX RTM replacement |

**The recommendation (in `failure_predictions.recommended_action` and the critical `alerts` row):** expedite the thrust bearing (air-freight the 14-day lead); return BFP-2C to service by closing its WO; if unavailable, **pre-emptively derate U3** to protect the grid commitment rather than risk an uncontrolled trip.

**Why it's the money shot:** it demonstrates predictive + planning + inventory + commercial in a single answer, and the recommendation is exactly what the synthetic **BFP O&M Manual** (`data/manuals/BFP-OM-Manual.pdf`, §5 bearing-failure playbook) prescribes — so the intelligence layer can *cite the manual* that proves the call.

**Config knobs** (`config.GOLDEN`): `vib_now=6.1`, `rul_days=5`, `confidence_pct=87`, `spare_lead_time_days=14`, `po_eta_days=12`, `derate_to_pct=68`.

---

## Secondary scenarios (so the whole dashboard lights up)

These populate other cards and prove the twin isn't a one-trick demo.

### 🔶 Coal stock critical — CSTPS
Imported-coal receipts lag burn over the recent window; `fuel_stock.days_of_coal` for CSTPS dips to **~3.4 days** (below the 4-day CEA critical threshold). Fires a `warning` fuel alert. Knob: `SECONDARY.coal_low_plant`, `coal_days_now`.

### 🔶 NOx creeping toward the limit — VSTPS-U2
One unit's `emissions.nox_mg_nm3` trends up over ~3 weeks toward the **300 mg/Nm³** CPCB limit (peaks ~305), while all other units sit comfortably ~210–280. Fires a `warning` emission alert. Knob: `SECONDARY.nox_exceed_unit`.

### 🔶 Mild mill wear — VSTPS-U1 Mill-C
A coal mill shows a gentle vibration rise to ~4.9 mm/s (just over the 4.5 alert, low anomaly score) — a lower-severity `info` prediction to contrast with the acute BFP case. Knob: `SECONDARY.mill_degrade`.

---

## Historical outages (reliability & realized-loss context)

Planted in `config.OUTAGES` so the reliability metrics and the "what already leaked" story have substance:

| Unit | ~Days ago | Class | Cause | Effect |
|---|---|---|---|---|
| VSTPS-U2 | 41 | forced | Boiler tube leak (platen SH) | 74 h full outage — the **largest realized ₹ loss** (~₹5.8 Cr) |
| VSTPS-U1 | 58 | forced | Mill-B gearbox failure | 50 h partial derating |
| CSTPS-U1 | 63 | planned | Annual overhaul | 168 h — **no capacity-charge loss** (planned, within NAPAF) |
| CSTPS-U2 | 20 | forced | Low imported-coal stock | 30 h partial derating |
| VSTPS-U3 | 70 | maintenance | BFP-2C bearing job | sets up the golden "standby down" state |

**Note on the 90-day realized exposure** (`v_exposure_90d`): after modeling, the *avoidable* loss is correctly led by the **forced** BTL outage on VSTPS-U2, not the planned CSTPS overhaul — because planned maintenance is already priced into NAPAF and books no capacity-charge loss. This keeps the "Ballast prevents avoidable ₹ loss" narrative honest.

---

## How to re-tune

1. Edit `config.py` (`GOLDEN`, `SECONDARY`, `OUTAGES`, or the fleet in `UNITS`/`EQUIP_TEMPLATE`).
2. `python3 data/generate.py` — rebuilds `ballast.db` deterministically.
3. `python3 data/verify.py` — confirms the golden traversal still holds and 15/15 checks pass.
4. `python3 data/build_manuals.py` — only if you changed thresholds the manuals cite.
