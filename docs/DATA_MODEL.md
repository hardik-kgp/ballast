# Ballast — Data Model Reference

Every table and view in `data/ballast.db`, documented. **27 tables + 4 views**, grouped by layer. Source-system tags: **[DCS/HIST]** historian/control, **[CMMS]** maintenance, **[COMM]** commercial/market, **[BALLAST]** AI outputs.

**Conventions.** High-res `ts` = INTEGER Unix epoch **seconds UTC** (IST = `datetime(ts+19800,'unixepoch')`). Daily tables use TEXT `date`=`YYYY-MM-DD`, `month`=`YYYY-MM`. Rupees are in ₹; ÷1e7 = crore. "Now" = `data_meta.clock_now`. Tables marked *WITHOUT ROWID* are keyed on a composite primary key for compact time-series storage.

Entity-relationship spine:
```
plants ─1:N─ units ─1:N─ equipment ─1:N─ process_tags ─1:N─ telemetry / telemetry_1min
                 │            │  └─self-ref standby_equip_id
                 │            ├─1:N─ condition_monitoring
                 │            ├─1:N─ work_orders ──► failure_modes
                 │            ├─M:N─ spares_inventory (via equipment_spares) ──► purchase_orders
                 │            └─1:N─ failure_predictions / alerts
                 ├─1:N─ unit_operating_state / emissions / performance_kpi
                 ├─1:N─ commitments / commercial_exposure / schedule_blocks
                 ├─1:N─ reliability_metrics / outage_events / tariff_components / beneficiaries
plants ─1:N─ fuel_stock / ambient_weather
```

---

## Layer 0 — Meta

### `data_meta` — [BALLAST] key-value
The clock/now pointer + generation metadata. The UI reads `clock_now` to know "current time."
| key | meaning |
|---|---|
| `clock_now` | epoch of current sim time (advanced by `live_tick.py`) |
| `history_start` / `history_end` | epoch bounds of generated history |
| `tz_offset_seconds` | 19800 (IST offset) |
| `seed`, `generated_at`, `schema_version` | provenance |
| `golden_equip`, `golden_unit` | pointers to the rigged scenario |

---

## Layer 1 — Asset master  [CMMS]  (ISO 14224 taxonomy)

### `plants` — one row per generating station
`plant_id` (PK) · `name` · `location` · `state` · `total_capacity_mw` · `fuel_type` (`domestic_coal`|`imported_coal`) · `commissioning_year` · `operator`.

### `units` — one row per generating unit *(holds the ₹ drivers)*
`unit_id` (PK) · `plant_id` (FK) · `name` · `capacity_mw` (installed/MCR) · `tech` (`subcritical`|`supercritical`) · `commissioning_date` · **`napaf_pct`** (Normative Annual Plant Availability Factor — 83 domestic-coal, 85 imported) · **`afc_cr_per_year`** (Annual Fixed Cost, ₹ crore/yr — basis for capacity charge) · `aux_consumption_norm_pct` · `heat_rate_norm` (kcal/kWh) · `energy_charge_rate_inr_kwh`.

### `equipment` — one row per physical asset
ISO 14224 taxonomy; `standby_equip_id` self-reference encodes redundancy so "no healthy standby" is computable.
`equip_id` (PK) · `unit_id` (FK) · `system` (L6: boiler / boiler_feedwater / turbine / cooling / generator / flue_gas …) · `subsystem` · `equipment_class` (ISO class: centrifugal_pump / fan / steam_turbine / generator / mill / heat_exchanger …) · `tag_no` (plant tag) · `name` · `type` (boiler_feed_pump / coal_mill / id_fan / cw_pump …) · `oem` · `rating` · `install_date` · **`criticality`** (A trips/derates unit · B major · C minor) · **`redundancy`** (2x50% / 3x50% / N+1 / none) · **`standby_equip_id`** (FK→equipment) · `mtbf_hours` · `expected_life_years` · **`monitored`** (1 = streams condition + 1-min telemetry).

### `failure_modes` — [CMMS] ISO 14224 catalog (reference)
Per equipment_class: the standard failure modes, mechanisms, detection and repair time.
`fm_id` (PK) · `equipment_class` · `failure_mode` (observed effect: vibration_high, bearing_failure, tube_leak…) · `failure_mechanism` (physical cause: fatigue, erosion, misalignment…) · `detection_method` (vibration_analysis, oil_analysis…) · `typical_mttr_hours` · `severity` · `gads_cause_code` (maps to NERC GADS cause family).

---

## Layer 2 — PI tag catalog  [DCS/HIST]

### `process_tags` — one row per historian tag
Mirrors a PI point. Join to telemetry via `tag_id`.
`tag_id` (PK) · `tag_name` (PI-style dotted path, e.g. `VSTPS.U3.BFP-A.VIBRATION`) · `unit_id` (FK) · `equip_id` (FK) · `param_type` (vibration / bearing_temp / winding_temp / pressure / temperature / flow / level / current / speed / power / vacuum / displacement / frequency) · `uom` · `lo_lo` `lo` `hi` `hi_hi` (alarm limits) · **`tier`** (`both` = also stored at 1-min, else `hourly`). ~465 tags across the fleet.

---

## Layer 3 — Operational time-series  [DCS/HIST]  (tiered)

### `telemetry` — hourly, 90 days, all tags  *(WITHOUT ROWID)*
`tag_id` (PK, FK) · `ts` (PK, epoch) · `value` · `quality` (OPC quality; 192 = Good). Full-history rollup for trend charts. ~1.0M rows.

### `telemetry_1min` — 1-minute, ~14 days, monitored tags  *(WITHOUT ROWID)*
Same columns. High-res raw for the live twin + vibration zoom; `live_tick.py` appends here. ~4.3M rows.

### `condition_monitoring` — hourly per monitored rotating asset  *(WITHOUT ROWID)*
Bently-Nevada-style health record.
`equip_id` (PK, FK) · `ts` (PK) · `vibration_mm_s` (overall velocity RMS, ISO 10816) · `vibration_axial_mm_s` · `bearing_temp_de_c` (drive-end) · `bearing_temp_nde_c` · `winding_temp_c` (motors/gen) · `oil_particle_iso` (ISO 4406 code) · **`health_index`** (0–100, 100 = healthy; derived from vibration + bearing temp). Latest snapshot via view `v_equipment_health_now`.

### `unit_operating_state` — 15-min per unit  *(WITHOUT ROWID)*
`unit_id` (PK, FK) · `ts` (PK) · `load_mw` (net ex-bus) · `gross_mw` · **`state`** (running / derated / tripped / reserve_shutdown / planned_outage / startup) · `frequency_hz` (drives DSM sign) · `ramp_mw_per_min`.

### `emissions` — hourly per unit (CEMS)  *(WITHOUT ROWID)*
`unit_id` (PK, FK) · `ts` (PK) · `sox_mg_nm3` · `nox_mg_nm3` · `spm_mg_nm3` · `co2_t_per_hr` · `o2_pct` · `stack_temp_c`. CPCB norms: SO₂ 600, NOx 300, SPM 50 mg/Nm³.

### `ambient_weather` — hourly per plant  *(WITHOUT ROWID)*
`plant_id` (PK, FK) · `ts` (PK) · `ambient_temp_c` · `humidity_pct` · `cw_inlet_temp_c` (cooling-water inlet — affects condenser vacuum & achievable output).

---

## Layer 4 — Performance / efficiency  [DCS/HIST + calc]  (CEA/PAT)

### `performance_kpi` — daily per unit
`unit_id` (PK, FK) · `date` (PK) · `plf_pct` (plant load factor) · `paf_pct` (plant availability factor) · `station_heat_rate_kcal_kwh` (lower = more efficient; normative gross) · `heat_rate_deviation_pct` (vs normative) · `aux_consumption_pct` · `specific_coal_consumption_kg_kwh` (= SHR ÷ GCV) · `specific_oil_ml_kwh` · `thermal_efficiency_pct` · `generation_mwh`. Primary source for KPI charts.

---

## Layer 5 — Maintenance & reliability  [CMMS]  (GADS / IEEE 762)

### `work_orders` — one per WO
`wo_id` (PK) · `equip_id` (FK) · `type` (preventive / breakdown / predictive / inspection) · `status` (open / in_progress / completed / scheduled) · `priority` (emergency / high / normal / low) · `fm_id` (FK→failure_modes) · `description` · `created_ts` · `planned_start` · `planned_end` · `actual_end` · `labor_hours` · `cost_inr` · `pm_frequency_days` · `next_due`. *Golden:* BFP-2C carries an `in_progress` breakdown WO (standby down); BFP-2A carries an `open` predictive WO.

### `outage_events` — one per outage/derating (GADS classes)
`outage_id` (PK) · `unit_id` (FK) · `equip_id` (FK, nullable) · `gads_event_type` (U1 forced immediate / U2-U3 forced delayed / PO planned / MO maintenance / D1-D4 deratings) · `class` (forced / planned / maintenance / derating) · `start_ts` · `end_ts` · `duration_hours` · `cause_code` (BTL / MILL / BFP / TURB_VIB / COND_VAC / GEN / CHP / GRID / COAL) · `cause_desc` · `mw_reduction` · `mwh_lost`.

### `reliability_metrics` — monthly per unit (IEEE 762)
`unit_id` (PK, FK) · `month` (PK) · `eaf_pct` (Equivalent Availability Factor) · `ef_pct` · `efor_pct` (Equivalent Forced Outage Rate) · `eford_pct` (EFOR-demand, best reliability measure) · `availability_pct` · `mtbf_hours` · `mttr_hours` · `starts` · `trips`.

---

## Layer 6 — Ballast AI outputs  [BALLAST]

### `failure_predictions` — one per prediction *(the agentic output the UI reads)*
`pred_id` (PK) · `equip_id` (FK) · `generated_ts` · `predicted_failure_date` · `rul_days` (remaining useful life) · `confidence_pct` · `anomaly_score` (0–1) · `failure_mode` (ISO 14224 vocab) · **`recommended_action`** · **`rupees_at_risk`** (Ballast's ₹ exposure estimate) · `status` (active / acknowledged / resolved). The golden BFP-2A prediction lives here (₹4.76 Cr).

### `alerts` — one per alert (live notification stream)
`alert_id` (PK) · `ts` (epoch) · `unit_id` (FK) · `equip_id` (FK) · `severity` (critical / warning / info) · `category` (condition / process / commercial / fuel / emission) · `title` · `message` · `rupees_at_risk` · `status` · `source` (which signal/rule fired it; `live_tick` for streamed alerts). Surface via view `v_active_alerts`.

---

## Layer 7 — Spares & fuel  ("raw materials")  [CMMS / ERP]

### `spares_inventory` — one per part
`part_id` (PK) · `name` · `equip_type` · `on_hand_qty` · `reorder_level` · **`lead_time_days`** (procurement lead — the golden-query constraint) · `unit_cost_inr` · `is_critical` · `supplier` · `warehouse`. *Golden:* `SP-BRG-BFP-THR` (thrust bearing) `on_hand_qty=0`, `lead_time_days=14`.

### `equipment_spares` — BOM link (M:N)
`equip_id` (PK, FK) · `part_id` (PK, FK) · `qty_per_overhaul`. Which spare each equipment needs.

### `purchase_orders` — one per PO
`po_id` (PK) · `part_id` (FK) · `qty` · `order_date` · `eta` · `status` (open / in_transit / received) · `unit_cost_inr` · `expedited`. *Golden:* `PO-2026-3391` for the bearing arrives ~12 days out (too late).

### `fuel_stock` — daily per plant
`plant_id` (PK, FK) · `date` (PK) · `coal_stock_mt` · **`days_of_coal`** (stock ÷ daily burn; < 4 days = critical per CEA) · `daily_burn_mt` · `gcv_kcal_kg` (lower GCV → worse heat rate) · `moisture_pct` · `ash_pct` · `cost_inr_per_mt` · `source` (linkage / imported / e_auction). *Secondary:* CSTPS dips to ~3.4 days.

---

## Layer 8 — Commercial & scheduling / market  [COMM]  (CERC ABT, DSM, IEX)

### `commitments` — daily per unit
`unit_id` (PK, FK) · `date` (PK) · **`declared_capacity_mw`** (DC to grid — what "run closer to capacity" moves) · `scheduled_mwh` (by load despatch centre) · `actual_mwh` · `paf_pct` · `plf_pct`.

### `schedule_blocks` — 15-min per unit, recent ~14 days  *(WITHOUT ROWID)*
`unit_id` (PK, FK) · `ts` (PK) · `scheduled_mw` · `actual_mw` · `declared_mw` · `frequency_hz`. Intraday dispatch-profile chart.

### `commercial_exposure` — daily per unit *(THE ₹ table)*
`unit_id` (PK, FK) · `date` (PK) · `capacity_charge_earned_inr` (recovered given the day's PAF vs NAPAF) · **`capacity_charge_lost_inr`** (under-recovery when PAF < NAPAF; 0 on planned-outage days) · `energy_charge_inr` · `dsm_deviation_mwh` (+ over / − under injection) · **`dsm_charge_inr`** (>0 penalty, <0 incentive) · `rtm_replacement_mwh` (bought on IEX RTM to cover a shortfall) · **`rtm_replacement_cost_inr`** (exchange premium) · `exchange_price_inr_mwh` · **`net_exposure_inr`** (= lost CC + DSM + RTM premium; the number Ballast minimizes). Totals via view `v_exposure_90d`.

### `tariff_components` — per unit × component
`unit_id` (PK, FK) · `component` (PK: return_on_equity / depreciation / interest_on_loan / o_and_m / interest_on_working_capital) · `annual_inr` · `pct_of_afc`. AFC breakdown → waterfall chart.

### `market_prices` — 15-min, 90 days, DAM+RTM  *(WITHOUT ROWID)*
`ts` (PK, epoch) · `market` (PK: DAM / RTM) · `region` · `price_inr_mwh`. IEX clearing-price curve.

### `beneficiaries` — per unit × discom
`unit_id` (PK, FK) · `beneficiary` (PK: discom/state) · `allocated_mw` · `share_pct` · `tariff_inr_kwh`. PPA allocation pie.

---

## Views (for the UI / LLM)

| View | Returns |
|---|---|
| `v_equipment_health_now` | latest condition + health per monitored asset, with redundancy/standby |
| `v_unit_latest_state` | latest operating state per unit |
| `v_exposure_90d` | 90-day ₹ exposure per unit (crore), split into CC-lost / DSM / RTM |
| `v_active_alerts` | active alerts, severity-ordered, joined to equipment name |

---

## Approximate row counts

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| telemetry_1min | ~4.3M | | commercial_exposure | 450 |
| telemetry | ~1.0M | | performance_kpi | 450 |
| condition_monitoring | ~227k | | process_tags | 465 |
| unit_operating_state | ~43k | | equipment | 135 |
| market_prices | ~17k | | equipment_spares | 130 |
| emissions | ~11k | | work_orders | ~125 |
| schedule_blocks | ~7k | | reliability_metrics | 20 |
| ambient_weather | ~4k | | failure_predictions | 5 |
| commitments | 450 | | alerts | 4 |

Total ≈ 5.6M rows, ~175 MB. See [SCENARIOS.md](SCENARIOS.md) for the rigged storylines that make these tables tell a coherent story.
