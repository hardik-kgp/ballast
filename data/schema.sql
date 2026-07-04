-- ============================================================================
-- BALLAST — Data Layer Schema  (enriched, grounded)
-- The "commercial brain" for Indian thermal power plants.
--
-- Every table is tagged with the REAL source system it would stream from in
-- production. In the demo we synthesize it, but the schema is shaped as if
-- three source systems + one historian were already connected:
--
--   [DCS/HIST]  Distributed Control System + Historian  — Emerson Ovation, OSIsoft/AVEVA PI
--   [CMMS]      Maintenance / EAM                        — SAP PM, IBM Maximo
--   [COMM]      Commercial / Scheduling / Market         — RLDC/SLDC, REMC, IEX/PXIL
--   [BALLAST]   Ballast's own AI/agentic outputs         — predictions, alerts
--
-- Grounded to industry standards:
--   ISO 14224     equipment taxonomy + failure-mode/mechanism vocabulary
--   NERC GADS /   generating availability & reliability metrics (EAF/EFOR/EFORd),
--   IEEE 762      outage event classes
--   CERC ABT 2024 availability-based tariff, capacity charge, DSM
--   CEA/PAT       performance norms (heat rate, PLF, aux, specific coal)
--   CPCB CEMS     emission monitoring (SOx/NOx/SPM/CO2)
--
-- Time storage convention:
--   * High-volume time-series ts  -> INTEGER Unix epoch seconds (UTC). Compact + fast range scans.
--   * Daily / reference tables    -> TEXT ISO-8601 date 'YYYY-MM-DD'. Easy for the LLM to read.
-- IST = UTC + 19800 s (see data_meta 'tz_offset_seconds').
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ===========================================================================
-- 0.  META / CLOCK  [BALLAST]  — powers the "live twin" now-pointer
-- ===========================================================================
CREATE TABLE data_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT
    -- rows: 'clock_now' (epoch of current sim time), 'history_start', 'history_end',
    --       'seed', 'generated_at', 'tz_offset_seconds', 'schema_version'
);

-- ===========================================================================
-- 1.  ASSET MASTER  [CMMS]  (ISO 14224 taxonomy)
-- ===========================================================================

CREATE TABLE plants (
    plant_id            TEXT PRIMARY KEY,      -- 'VSTPS'
    name                TEXT NOT NULL,
    location            TEXT,
    state               TEXT,
    total_capacity_mw   REAL NOT NULL,
    fuel_type           TEXT NOT NULL,         -- 'domestic_coal' | 'imported_coal'
    commissioning_year  INTEGER,
    operator            TEXT                   -- 'NTPC' etc.
);

CREATE TABLE units (
    unit_id             TEXT PRIMARY KEY,      -- 'VSTPS-U3'
    plant_id            TEXT NOT NULL REFERENCES plants(plant_id),
    name                TEXT NOT NULL,
    capacity_mw         REAL NOT NULL,         -- installed capacity (MCR)
    tech                TEXT,                  -- 'subcritical' | 'supercritical'
    commissioning_date  TEXT,
    napaf_pct           REAL NOT NULL,         -- Normative Annual PAF (CERC): 85, or 83 for domestic coal
    afc_cr_per_year     REAL NOT NULL,         -- Annual Fixed Cost, INR crore/year
    aux_consumption_norm_pct  REAL NOT NULL,   -- normative auxiliary energy consumption %
    heat_rate_norm      REAL,                  -- normative gross station heat rate kcal/kWh
    energy_charge_rate_inr_kwh  REAL           -- normative variable/energy charge
);

-- ISO 14224 taxonomy: system -> subsystem -> equipment_class -> maintainable item.
-- standby_equip_id encodes redundancy so "no healthy standby" is computable.
CREATE TABLE equipment (
    equip_id            TEXT PRIMARY KEY,      -- 'VSTPS-U3-BFP-2A'
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    system              TEXT NOT NULL,         -- ISO14224 L6: 'boiler_feedwater','boiler','turbine','cooling','generator','coal_handling','ash_handling','flue_gas'
    subsystem           TEXT,                  -- ISO14224 L7
    equipment_class     TEXT NOT NULL,         -- ISO14224 class: 'centrifugal_pump','steam_turbine','electric_motor','fan','heat_exchanger','fired_heater','generator','crusher','conveyor'
    tag_no              TEXT NOT NULL,         -- plant tag, e.g. '3-BFP-2A'
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,         -- 'boiler_feed_pump','coal_mill','id_fan','fd_fan','pa_fan','steam_turbine','generator','cw_pump','condenser','air_preheater','esp','crusher'
    oem                 TEXT,
    rating              TEXT,                  -- free-text nameplate e.g. '50% MCR, 9500 kW'
    install_date        TEXT,
    criticality         TEXT NOT NULL,         -- 'A' trips/derates unit | 'B' major | 'C' minor
    redundancy          TEXT NOT NULL,         -- '2x50%' | '2x100%' | '3x50%' | 'N+1' | 'none'
    standby_equip_id    TEXT REFERENCES equipment(equip_id),
    mtbf_hours          REAL,                  -- mean time between failures
    expected_life_years REAL,
    monitored           INTEGER NOT NULL DEFAULT 0  -- 1 => streams condition_monitoring + 1-min telemetry
);
CREATE INDEX idx_equipment_unit ON equipment(unit_id);
CREATE INDEX idx_equipment_type ON equipment(type);

-- ISO 14224 failure-mode catalog (reference): per equipment_class, the standard
-- failure modes, their mechanisms, how they're detected, and typical repair time.
CREATE TABLE failure_modes (
    fm_id               INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_class     TEXT NOT NULL,         -- matches equipment.equipment_class
    failure_mode        TEXT NOT NULL,         -- observed effect: 'vibration_high','bearing_failure','external_leakage','tube_leak','insulation_degradation'
    failure_mechanism   TEXT,                  -- physical cause: 'fatigue','erosion','corrosion','misalignment','contamination'
    detection_method    TEXT,                  -- 'vibration_analysis','oil_analysis','thermography','process_deviation'
    typical_mttr_hours  REAL,                  -- mean time to repair
    severity            TEXT,                  -- 'critical' | 'major' | 'minor'
    gads_cause_code     TEXT                   -- maps to NERC GADS cause code family
);

-- ===========================================================================
-- 2.  PI TAG CATALOG  [DCS/HIST]
-- ===========================================================================
-- Every measured/calculated point. Mirrors a PI point / AF attribute.
CREATE TABLE process_tags (
    tag_id              INTEGER PRIMARY KEY,
    tag_name            TEXT NOT NULL UNIQUE,  -- 'VSTPS.U3.BFP2A.VIB.DE'  (PI-style dotted path)
    unit_id             TEXT REFERENCES units(unit_id),
    equip_id            TEXT REFERENCES equipment(equip_id),
    param_type          TEXT NOT NULL,         -- 'vibration','bearing_temp','winding_temp','pressure','temperature','flow','level','current','speed','power','vacuum','emission','frequency'
    uom                 TEXT NOT NULL,         -- 'mm/s','degC','bar','kg/s','%','A','rpm','MW','mmHg','mg/Nm3','Hz'
    lo_lo               REAL,                  -- alarm limits
    lo                  REAL,
    hi                  REAL,
    hi_hi               REAL,
    tier                TEXT NOT NULL DEFAULT 'hourly'  -- 'both' (1-min + hourly) if monitored, else 'hourly'
);
CREATE INDEX idx_tags_equip ON process_tags(equip_id);
CREATE INDEX idx_tags_unit ON process_tags(unit_id);

-- ===========================================================================
-- 3.  OPERATIONAL TIME-SERIES  [DCS/HIST]  (tiered, PI-style raw + rollup)
-- ===========================================================================

-- Full-history rollup: HOURLY, 90 days, ALL tags.  (trend charts)
CREATE TABLE telemetry (
    tag_id              INTEGER NOT NULL REFERENCES process_tags(tag_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (top of hour)
    value               REAL,
    quality             INTEGER DEFAULT 192,   -- OPC quality (192 = Good)
    PRIMARY KEY (tag_id, ts)
) WITHOUT ROWID;

-- High-res raw: 1-MINUTE, recent window (~14 days), MONITORED tags only.
-- Powers the "live twin" + vibration zoom. Live ticker appends here.
CREATE TABLE telemetry_1min (
    tag_id              INTEGER NOT NULL REFERENCES process_tags(tag_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (minute)
    value               REAL,
    quality             INTEGER DEFAULT 192,
    PRIMARY KEY (tag_id, ts)
) WITHOUT ROWID;

-- Condition monitoring rollup per rotating asset (Bently Nevada style).
CREATE TABLE condition_monitoring (
    equip_id            TEXT NOT NULL REFERENCES equipment(equip_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (hourly)
    vibration_mm_s      REAL,                  -- overall velocity RMS (ISO 10816)
    vibration_axial_mm_s REAL,
    bearing_temp_de_c   REAL,                  -- drive-end bearing
    bearing_temp_nde_c  REAL,                  -- non-drive-end bearing
    winding_temp_c      REAL,                  -- motors/generator
    oil_particle_iso    REAL,                  -- ISO 4406 contamination code
    health_index        REAL,                  -- 0..100 rollup (100 = healthy) used by the twin
    PRIMARY KEY (equip_id, ts)
) WITHOUT ROWID;

-- Unit operating state (DCS): load, running state, grid frequency.
CREATE TABLE unit_operating_state (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (15-min)
    load_mw             REAL NOT NULL,         -- net ex-bus MW
    gross_mw            REAL,                  -- gross generator MW
    state               TEXT NOT NULL,         -- 'running','derated','tripped','reserve_shutdown','planned_outage','startup'
    frequency_hz        REAL,                  -- grid frequency (drives DSM sign)
    ramp_mw_per_min     REAL,
    PRIMARY KEY (unit_id, ts)
) WITHOUT ROWID;

-- CEMS emissions [DCS/HIST + CPCB].
CREATE TABLE emissions (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (hourly)
    sox_mg_nm3          REAL,                  -- SO2
    nox_mg_nm3          REAL,                  -- norm 750 mg/Nm3 for coal
    spm_mg_nm3          REAL,                  -- suspended particulate matter
    co2_t_per_hr        REAL,
    o2_pct              REAL,                  -- flue gas O2
    stack_temp_c        REAL,
    PRIMARY KEY (unit_id, ts)
) WITHOUT ROWID;

-- Ambient / cooling water (drives condenser vacuum & achievable output).
CREATE TABLE ambient_weather (
    plant_id            TEXT NOT NULL REFERENCES plants(plant_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (hourly)
    ambient_temp_c      REAL,
    humidity_pct        REAL,
    cw_inlet_temp_c     REAL,
    PRIMARY KEY (plant_id, ts)
) WITHOUT ROWID;

-- ===========================================================================
-- 4.  PERFORMANCE / EFFICIENCY  [DCS/HIST + calc]  (CEA/PAT norms)
-- ===========================================================================
CREATE TABLE performance_kpi (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    date                TEXT NOT NULL,         -- 'YYYY-MM-DD'
    plf_pct             REAL,                  -- plant load factor
    paf_pct             REAL,                  -- plant availability factor
    station_heat_rate_kcal_kwh  REAL,          -- lower = more efficient (avg ~3149)
    heat_rate_deviation_pct     REAL,          -- vs normative
    aux_consumption_pct REAL,
    specific_coal_consumption_kg_kwh    REAL,
    specific_oil_ml_kwh REAL,
    thermal_efficiency_pct      REAL,
    generation_mwh      REAL,
    PRIMARY KEY (unit_id, date)
);

-- ===========================================================================
-- 5.  MAINTENANCE & RELIABILITY  [CMMS]  (GADS / IEEE 762)
-- ===========================================================================

CREATE TABLE work_orders (
    wo_id               TEXT PRIMARY KEY,      -- 'WO-2026-00412'
    equip_id            TEXT NOT NULL REFERENCES equipment(equip_id),
    type                TEXT NOT NULL,         -- 'preventive' | 'breakdown' | 'predictive' | 'inspection'
    status              TEXT NOT NULL,         -- 'open' | 'in_progress' | 'completed' | 'scheduled'
    priority            TEXT NOT NULL,         -- 'emergency' | 'high' | 'normal' | 'low'
    fm_id               INTEGER REFERENCES failure_modes(fm_id),  -- linked failure mode (if breakdown/predictive)
    description         TEXT,
    created_ts          TEXT,
    planned_start       TEXT,
    planned_end         TEXT,
    actual_end          TEXT,
    labor_hours         REAL,
    cost_inr            REAL,
    pm_frequency_days   INTEGER,               -- if recurring PM
    next_due            TEXT
);
CREATE INDEX idx_wo_equip ON work_orders(equip_id);
CREATE INDEX idx_wo_status ON work_orders(status);

-- Outage / derating events (GADS event classes).
CREATE TABLE outage_events (
    outage_id           TEXT PRIMARY KEY,
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    equip_id            TEXT REFERENCES equipment(equip_id),
    gads_event_type     TEXT NOT NULL,         -- 'U1' forced immediate, 'U2/U3' forced delayed, 'PO' planned, 'MO' maintenance, 'D1..D4' deratings
    class               TEXT NOT NULL,         -- 'forced' | 'planned' | 'maintenance' | 'derating'
    start_ts            TEXT NOT NULL,
    end_ts              TEXT,
    duration_hours      REAL,
    cause_code          TEXT,                  -- 'BTL' boiler tube leak, 'MILL', 'BFP', 'TURB_VIB', 'COND_VAC', 'GEN', 'CHP', 'GRID', 'COAL'
    cause_desc          TEXT,
    mw_reduction        REAL,                  -- for deratings (0 = full trip; capacity via state)
    mwh_lost            REAL
);
CREATE INDEX idx_outage_unit ON outage_events(unit_id);

-- Reliability metrics per unit per month (GADS / IEEE 762 definitions).
CREATE TABLE reliability_metrics (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    month               TEXT NOT NULL,         -- 'YYYY-MM'
    eaf_pct             REAL,                  -- Equivalent Availability Factor
    ef_pct              REAL,                  -- Equivalent Forced outage factor
    efor_pct            REAL,                  -- Equivalent Forced Outage Rate
    eford_pct           REAL,                  -- EFOR-demand (best reliability measure)
    availability_pct    REAL,
    mtbf_hours          REAL,
    mttr_hours          REAL,
    starts              INTEGER,
    trips               INTEGER,
    PRIMARY KEY (unit_id, month)
);

-- ===========================================================================
-- 6.  BALLAST AI OUTPUTS  [BALLAST]  — the agentic layer's results
-- ===========================================================================

-- Failure predictions / RUL from Ballast's models (what the UI reads).
CREATE TABLE failure_predictions (
    pred_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    equip_id            TEXT NOT NULL REFERENCES equipment(equip_id),
    generated_ts        TEXT,                  -- when Ballast produced this
    predicted_failure_date  TEXT,
    rul_days            REAL,                  -- remaining useful life
    confidence_pct      REAL,
    anomaly_score       REAL,                  -- 0..1
    failure_mode        TEXT,                  -- predicted mode (ISO 14224 vocab)
    recommended_action  TEXT,
    rupees_at_risk      REAL,                  -- Ballast's ₹ exposure estimate if unaddressed
    status              TEXT                   -- 'active' | 'acknowledged' | 'resolved'
);
CREATE INDEX idx_pred_equip ON failure_predictions(equip_id);

-- Live alert / notification stream (what the twin surfaces in real time).
CREATE TABLE alerts (
    alert_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                  INTEGER NOT NULL,      -- epoch seconds
    unit_id             TEXT REFERENCES units(unit_id),
    equip_id            TEXT REFERENCES equipment(equip_id),
    severity            TEXT NOT NULL,         -- 'critical' | 'warning' | 'info'
    category            TEXT,                  -- 'condition' | 'process' | 'commercial' | 'fuel' | 'emission'
    title               TEXT NOT NULL,
    message             TEXT,
    rupees_at_risk      REAL,
    status              TEXT DEFAULT 'active', -- 'active' | 'acknowledged' | 'resolved'
    source              TEXT                   -- which signal/tag/rule fired it
);
CREATE INDEX idx_alerts_ts ON alerts(ts);

-- ===========================================================================
-- 7.  SPARES & FUEL  ("raw materials")  [CMMS / ERP]
-- ===========================================================================

CREATE TABLE spares_inventory (
    part_id             TEXT PRIMARY KEY,      -- 'SP-BRG-4560'
    name                TEXT NOT NULL,
    equip_type          TEXT,
    on_hand_qty         INTEGER NOT NULL,
    reorder_level       INTEGER NOT NULL,
    lead_time_days      INTEGER NOT NULL,      -- procurement lead time (constraint in golden query)
    unit_cost_inr       REAL,
    is_critical         INTEGER NOT NULL DEFAULT 0,
    supplier            TEXT,
    warehouse           TEXT
);

CREATE TABLE equipment_spares (             -- BOM: which spare each equipment needs
    equip_id            TEXT NOT NULL REFERENCES equipment(equip_id),
    part_id             TEXT NOT NULL REFERENCES spares_inventory(part_id),
    qty_per_overhaul    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (equip_id, part_id)
);

CREATE TABLE purchase_orders (
    po_id               TEXT PRIMARY KEY,
    part_id             TEXT NOT NULL REFERENCES spares_inventory(part_id),
    qty                 INTEGER NOT NULL,
    order_date          TEXT,
    eta                 TEXT,
    status              TEXT,                  -- 'open' | 'in_transit' | 'received'
    unit_cost_inr       REAL,
    expedited           INTEGER DEFAULT 0
);

CREATE TABLE fuel_stock (
    plant_id            TEXT NOT NULL REFERENCES plants(plant_id),
    date                TEXT NOT NULL,         -- 'YYYY-MM-DD'
    coal_stock_mt       REAL,                  -- tonnes on hand
    days_of_coal        REAL,                  -- stock / daily burn (critical < 4 days per CEA)
    daily_burn_mt       REAL,
    gcv_kcal_kg         REAL,                  -- lower GCV -> worse heat rate / derating
    moisture_pct        REAL,
    ash_pct             REAL,
    cost_inr_per_mt     REAL,
    source              TEXT,                  -- 'linkage' | 'imported' | 'e_auction'
    PRIMARY KEY (plant_id, date)
);

-- ===========================================================================
-- 8.  COMMERCIAL & SCHEDULING / MARKET  [COMM]  (CERC ABT, DSM, IEX)
-- ===========================================================================

-- Daily commitment vs actual per unit. declared_capacity_mw is what Ballast's
-- "run closer to capacity" recommendation moves.
CREATE TABLE commitments (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    date                TEXT NOT NULL,         -- 'YYYY-MM-DD'
    declared_capacity_mw    REAL NOT NULL,     -- DC to grid (basis for capacity charge)
    scheduled_mwh       REAL NOT NULL,         -- scheduled by load despatch centre
    actual_mwh          REAL NOT NULL,
    paf_pct             REAL NOT NULL,
    plf_pct             REAL,
    PRIMARY KEY (unit_id, date)
);

-- Intraday 15-min blocks (recent window) — dispatch profile chart.
CREATE TABLE schedule_blocks (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    ts                  INTEGER NOT NULL,      -- epoch seconds (15-min block)
    scheduled_mw        REAL,
    actual_mw           REAL,
    declared_mw         REAL,
    frequency_hz        REAL,
    PRIMARY KEY (unit_id, ts)
) WITHOUT ROWID;

-- The ₹ money table: ties availability + deviation to rupees (CERC formula + IEX).
CREATE TABLE commercial_exposure (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    date                TEXT NOT NULL,
    capacity_charge_earned_inr  REAL,          -- recovered given day's PAF vs NAPAF
    capacity_charge_lost_inr    REAL,          -- under-recovery due to PAF < NAPAF (penalty)
    energy_charge_inr   REAL,
    dsm_deviation_mwh   REAL,                  -- + over-injection, - under
    dsm_charge_inr      REAL,                  -- >0 paid (penalty), <0 received (incentive)
    rtm_replacement_mwh REAL,                  -- energy bought on IEX RTM to cover shortfall
    rtm_replacement_cost_inr    REAL,          -- premium paid at exchange
    exchange_price_inr_mwh      REAL,          -- reference IEX clearing price
    net_exposure_inr    REAL,                  -- total ₹ hit that day (lost CC + DSM + RTM premium)
    PRIMARY KEY (unit_id, date)
);

-- AFC breakdown (waterfall chart) — CERC cost-plus components.
CREATE TABLE tariff_components (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    component           TEXT NOT NULL,         -- 'return_on_equity','depreciation','interest_on_loan','o_and_m','interest_on_working_capital'
    annual_inr          REAL NOT NULL,
    pct_of_afc          REAL,
    PRIMARY KEY (unit_id, component)
);

-- IEX / power-exchange price time-series (DAM + RTM).
CREATE TABLE market_prices (
    ts                  INTEGER NOT NULL,      -- epoch seconds (15-min block)
    market              TEXT NOT NULL,         -- 'DAM' | 'RTM'
    region              TEXT DEFAULT 'A1',     -- price area
    price_inr_mwh       REAL,
    PRIMARY KEY (ts, market)
) WITHOUT ROWID;

-- Beneficiaries / PPA allocations (who buys the unit's power).
CREATE TABLE beneficiaries (
    unit_id             TEXT NOT NULL REFERENCES units(unit_id),
    beneficiary         TEXT NOT NULL,         -- discom / state
    allocated_mw        REAL,
    share_pct           REAL,
    tariff_inr_kwh      REAL,
    PRIMARY KEY (unit_id, beneficiary)
);
