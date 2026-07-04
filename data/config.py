"""
Ballast data-layer configuration.

Fleet definition + generation parameters + the rigged "golden scenario".
Everything reproducible: change SEED / constants here, re-run generate.py.
"""

SEED = 42

# --- Time base -------------------------------------------------------------
# Anchor "now" to a FIXED instant (not wall-clock) so runs are reproducible.
# Today in the demo world = 2026-07-04. Clock sits mid-morning IST.
ANCHOR_IST      = "2026-07-04 08:00:00"
TZ_OFFSET_SEC   = 19800            # IST = UTC + 5:30
HISTORY_DAYS    = 90               # hourly telemetry + daily rollups span
WINDOW_1MIN_DAYS = 14              # high-res 1-min window (recent)
SCHEDULE_BLOCK_DAYS = 14           # intraday 15-min dispatch window
MARKET_DAYS     = 90               # IEX price series span

# --- Fleet: 2 plants, 5 units ---------------------------------------------
# Plant A: inland domestic-coal, subcritical (NAPAF 83). Plant B: coastal
# imported-coal, supercritical (NAPAF 85). Synthetic but shaped like NTPC assets.
PLANTS = [
    dict(plant_id="VSTPS", name="Vindhya Super Thermal Power Station",
         location="Singrauli", state="Madhya Pradesh", fuel_type="domestic_coal",
         commissioning_year=2009, operator="NTPC"),
    dict(plant_id="CSTPS", name="Coastal Super Thermal Power Station",
         location="Nellore", state="Andhra Pradesh", fuel_type="imported_coal",
         commissioning_year=2015, operator="NTPC"),
]

UNITS = [
    # Plant A — 3 x 500 MW subcritical
    dict(unit_id="VSTPS-U1", plant_id="VSTPS", name="Unit 1", capacity_mw=500,
         tech="subcritical", commissioning_date="2009-06-01", napaf_pct=83,
         afc_cr_per_year=760, aux_norm=6.5, heat_rate_norm=2450, ec_rate=2.30),
    dict(unit_id="VSTPS-U2", plant_id="VSTPS", name="Unit 2", capacity_mw=500,
         tech="subcritical", commissioning_date="2010-03-01", napaf_pct=83,
         afc_cr_per_year=775, aux_norm=6.5, heat_rate_norm=2450, ec_rate=2.32),
    dict(unit_id="VSTPS-U3", plant_id="VSTPS", name="Unit 3", capacity_mw=500,
         tech="subcritical", commissioning_date="2011-01-01", napaf_pct=83,
         afc_cr_per_year=790, aux_norm=6.5, heat_rate_norm=2460, ec_rate=2.34),
    # Plant B — 2 x 660 MW supercritical
    dict(unit_id="CSTPS-U1", plant_id="CSTPS", name="Unit 1", capacity_mw=660,
         tech="supercritical", commissioning_date="2015-08-01", napaf_pct=85,
         afc_cr_per_year=1180, aux_norm=5.75, heat_rate_norm=2280, ec_rate=3.10),
    dict(unit_id="CSTPS-U2", plant_id="CSTPS", name="Unit 2", capacity_mw=660,
         tech="supercritical", commissioning_date="2016-02-01", napaf_pct=85,
         afc_cr_per_year=1195, aux_norm=5.75, heat_rate_norm=2280, ec_rate=3.12),
]

# --- Equipment template per unit ------------------------------------------
# (count, type, equipment_class, system, criticality, redundancy, monitored)
# Instances get suffixed A/B/C... The template is authored to be realistic for
# a coal unit: 6 mills, ID/FD/PA fans, 3 BFPs, turbine, generator, CW/CEP, etc.
EQUIP_TEMPLATE = [
    (6, "coal_mill",        "mill",              "boiler",            "B", "6x20%",  True),
    (2, "id_fan",           "fan",               "flue_gas",          "A", "2x50%",  True),
    (2, "fd_fan",           "fan",               "boiler",            "A", "2x50%",  True),
    (2, "pa_fan",           "fan",               "boiler",            "A", "2x50%",  True),
    (2, "air_preheater",    "heat_exchanger",    "boiler",            "B", "2x50%",  False),
    (1, "esp",              "electrostatic_precipitator", "flue_gas", "B", "none",   False),
    (1, "boiler",           "fired_heater",      "boiler",            "A", "none",   False),
    (3, "boiler_feed_pump", "centrifugal_pump",  "boiler_feedwater",  "A", "3x50%",  True),
    (2, "cep",              "centrifugal_pump",  "turbine",           "B", "2x100%", True),
    (2, "cw_pump",          "centrifugal_pump",  "cooling",           "A", "2x100%", True),
    (1, "condenser",        "heat_exchanger",    "cooling",           "A", "none",   False),
    (1, "steam_turbine",    "steam_turbine",     "turbine",           "A", "none",   True),
    (1, "generator",        "generator",         "generator",         "A", "none",   True),
    (1, "generator_transformer", "transformer",  "generator",         "A", "2x100%", False),
]

OEM_BY_CLASS = {
    "mill": "BHEL (Alstom lic.)", "fan": "BHEL", "heat_exchanger": "BHEL/Alstom",
    "electrostatic_precipitator": "BHEL", "fired_heater": "BHEL",
    "centrifugal_pump": "KSB / Sulzer", "steam_turbine": "BHEL (Siemens lic.)",
    "generator": "BHEL", "transformer": "CGL / BHEL",
}

# --- THE GOLDEN SCENARIO ---------------------------------------------------
# Rig one dramatic, cross-domain story into the data:
#   Boiler Feed Pump 2A on VSTPS-U3 is degrading (bearing wear -> rising
#   vibration), predicted to fail in ~5 days. Its standby BFP-2C is already
#   OUT on maintenance, so losing 2A derates the unit. VSTPS-U3's PAF is
#   hovering just above NAPAF (83%), so a derating pushes it below -> capacity-
#   charge under-recovery + DSM + RTM replacement cost. The spare thrust
#   bearing is out of stock with a 14-day lead time (PO arrives too late).
GOLDEN = dict(
    unit_id="VSTPS-U3",
    equip_type="boiler_feed_pump",
    equip_suffix="A",                 # BFP-2A (tag 2A)
    standby_suffix="C",               # BFP-2C is the standby, and it's DOWN
    degrade_start_days_ago=32,        # when vibration began trending
    accel_days_ago=10,                # when it started accelerating
    vib_now=6.1,                      # mm/s now (alert 4.5, danger 7.1)
    vib_baseline=2.4,
    rul_days=5,                       # predicted remaining useful life
    confidence_pct=87,
    spare_part_id="SP-BRG-BFP-THR",   # thrust bearing
    spare_lead_time_days=14,
    po_eta_days=12,                   # incoming PO arrives too late
    derate_to_pct=68,                 # unit derates to 68% if 2A lost w/o standby
)

# Secondary flavour scenarios so other dashboard cards are populated:
SECONDARY = dict(
    mill_degrade=dict(unit_id="VSTPS-U1", equip_type="coal_mill", suffix="C",
                      vib_now=4.9, vib_baseline=2.2),          # mild mill wear
    coal_low_plant="CSTPS",                                    # coastal coal stock dips (imported supply)
    coal_days_now=3.4,                                         # < 4 day critical threshold
    nox_exceed_unit="VSTPS-U2",                                # NOx creeping toward the 300 mg/Nm3 limit
)

# --- Commercial constants (grounded to CERC ABT + IEX magnitudes) ----------
CRORE = 1e7                          # 1 crore rupees
DSM_RATE_INR_MWH = 5500             # nominal DSM reference (varies w/ frequency)
RTM_BASE_INR_MWH = 4200            # IEX RTM base price
RTM_PEAK_INR_MWH = 9500            # evening-peak / scarcity price

# Emission norms (CPCB / MoEF 2015, units commissioned 2004-2016) for alert thresholds
NOX_LIMIT_MG_NM3 = 300
SOX_LIMIT_MG_NM3 = 600
SPM_LIMIT_MG_NM3 = 50
