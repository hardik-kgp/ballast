#!/usr/bin/env python3
"""
Ballast — synthetic data generator.

Builds ballast.db (SQLite) from schema.sql + config.py:
  * 2 plants / 5 units, ISO-14224-shaped equipment
  * tiered telemetry (hourly 90d for all tags + 1-min 14d for monitored tags)
  * condition monitoring, emissions, weather, performance KPIs
  * maintenance / GADS-style outages / reliability metrics
  * commercial exposure (CERC ABT formula), IEX prices, fuel, spares
  * Ballast AI outputs: failure predictions + a live alert stream
  * the rigged GOLDEN SCENARIO (BFP-2A on VSTPS-U3)

Reproducible: fixed SEED. Run:  python3 generate.py
"""
import os, sqlite3, math
import numpy as np
import pandas as pd
import config as C

HERE = os.path.dirname(os.path.abspath(__file__))
DB   = os.path.join(HERE, "ballast.db")
SCHEMA = os.path.join(HERE, "schema.sql")

rng = np.random.default_rng(C.SEED)

# --------------------------------------------------------------------------
# time base
# --------------------------------------------------------------------------
ANCHOR = pd.Timestamp(C.ANCHOR_IST)                       # IST wall time
def to_epoch(ts_index):
    """pandas naive IST timestamps -> UTC epoch seconds (numpy int64)."""
    return (ts_index.astype("int64") // 10**9 - C.TZ_OFFSET_SEC).astype("int64")

NOW_EPOCH = int(pd.Timestamp(C.ANCHOR_IST).value // 10**9 - C.TZ_OFFSET_SEC)

HOURLY_IST = pd.date_range(end=ANCHOR, periods=C.HISTORY_DAYS * 24, freq="h")
HOURLY_EP  = to_epoch(HOURLY_IST)
MIN_IST    = pd.date_range(end=ANCHOR, periods=C.WINDOW_1MIN_DAYS * 24 * 60, freq="min")
MIN_EP     = to_epoch(MIN_IST)
Q15_IST    = pd.date_range(end=ANCHOR, periods=C.HISTORY_DAYS * 24 * 4, freq="15min")
Q15_EP     = to_epoch(Q15_IST)
SCHED_IST  = pd.date_range(end=ANCHOR, periods=C.SCHEDULE_BLOCK_DAYS * 24 * 4, freq="15min")
SCHED_EP   = to_epoch(SCHED_IST)
DAYS_IST   = pd.date_range(end=ANCHOR.normalize(), periods=C.HISTORY_DAYS, freq="D")
DAY_STR    = [d.strftime("%Y-%m-%d") for d in DAYS_IST]

# supercritical units run hotter steam: both the VALUE and the alarm LIMITS shift up together.
UNIT_TECH={u["unit_id"]:u["tech"] for u in C.UNITS}
SC_STEAM_TAGS={"main_steam_temp","reheat_steam_temp","hp_metal_temp","ip_metal_temp"}
SC_STEAM_OFFSET=28

# --------------------------------------------------------------------------
# db bootstrap
# --------------------------------------------------------------------------
if os.path.exists(DB):
    os.remove(DB)
for ext in ("-wal", "-shm"):
    if os.path.exists(DB + ext):
        os.remove(DB + ext)

conn = sqlite3.connect(DB)
conn.executescript(open(SCHEMA).read())
# fast bulk-load pragmas
conn.execute("PRAGMA journal_mode=MEMORY")
conn.execute("PRAGMA synchronous=OFF")
conn.execute("PRAGMA foreign_keys=OFF")   # we insert in dependency order; keep loose during load
cur = conn.cursor()

def insert(table, cols, rows):
    if not rows:
        return 0
    ph = ",".join("?" * len(cols))
    cur.executemany(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({ph})", rows)
    return len(rows)

def insert_chunked(table, cols, row_iter, chunk=200_000):
    ph = ",".join("?" * len(cols))
    sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({ph})"
    buf, total = [], 0
    for r in row_iter:
        buf.append(r)
        if len(buf) >= chunk:
            cur.executemany(sql, buf); total += len(buf); buf = []
    if buf:
        cur.executemany(sql, buf); total += len(buf)
    return total

# --------------------------------------------------------------------------
# tag specs by equipment type  (name suffix, param, uom, base, gain, noise, hi, hihi, tier)
# gain = added at full load; value = base + gain*load_frac + noise (+ degradation overlay)
# --------------------------------------------------------------------------
def T(p, uom, base, gain, noise, hi=None, hihi=None, tier="hourly", name=None):
    return dict(p=p, uom=uom, base=base, gain=gain, noise=noise, hi=hi, hihi=hihi, tier=tier, name=name or p)

TAG_SPECS = {
    "coal_mill": [T("vibration","mm/s",2.2,0.6,0.20,4.5,7.1,"both"),
                  T("bearing_temp","degC",55,18,1.2,90,100,"both"),
                  T("current","A",40,70,2.0,None,None),
                  T("temperature","degC",68,16,1.5,95,105,name="outlet_temp")],
    "id_fan":   [T("vibration","mm/s",2.0,0.7,0.18,4.5,7.1,"both"),
                 T("bearing_temp","degC",52,20,1.2,90,100,"both"),
                 T("current","A",60,120,3.0)],
    "fd_fan":   [T("vibration","mm/s",1.9,0.6,0.18,4.5,7.1,"both"),
                 T("bearing_temp","degC",50,18,1.2,90,100,"both"),
                 T("current","A",45,90,2.5)],
    "pa_fan":   [T("vibration","mm/s",2.1,0.6,0.18,4.5,7.1,"both"),
                 T("bearing_temp","degC",51,18,1.2,90,100,"both"),
                 T("current","A",40,80,2.5)],
    "boiler_feed_pump": [T("vibration","mm/s",2.4,0.7,0.22,4.5,7.1,"both"),
                 T("bearing_temp","degC",58,20,1.4,95,105,"both"),
                 T("pressure","bar",165,20,1.2,None,None,name="discharge_pressure"),
                 T("flow","kg/s",120,320,6.0,None,None,name="feed_flow"),
                 T("current","A",120,260,5.0)],
    "cep":      [T("vibration","mm/s",1.8,0.5,0.18,4.5,7.1,"both"),
                 T("bearing_temp","degC",48,16,1.0,90,100),
                 T("pressure","bar",22,6,0.4,None,None,name="discharge_pressure")],
    "cw_pump":  [T("vibration","mm/s",2.0,0.5,0.18,4.5,7.1,"both"),
                 T("bearing_temp","degC",46,14,1.0,90,100),
                 T("pressure","bar",3.2,1.2,0.1,None,None,name="discharge_pressure")],
    "steam_turbine": [T("vibration","mm/s",2.6,0.9,0.20,4.5,7.5,"both",name="rotor_vibration"),
                 T("speed","rpm",2998,2,0.8,3030,3060),
                 T("temperature","degC",535,8,2.0,565,571,name="hp_metal_temp"),
                 T("temperature","degC",535,7,2.0,565,571,name="ip_metal_temp"),
                 T("bearing_temp","degC",70,22,1.5,110,120,"both",name="thrust_bearing_temp"),
                 T("pressure","bar",9.5,1.0,0.1,None,None,name="lube_oil_pressure"),
                 T("temperature","degC",45,10,0.8,60,65,name="lube_oil_temp"),
                 T("displacement","um",30,20,3.0,None,None,name="eccentricity_um")],
    "generator": [T("winding_temp","degC",60,32,1.6,110,120,"both",name="stator_winding_temp"),
                 T("temperature","degC",58,25,1.4,105,115,name="stator_core_temp"),
                 T("pressure","bar",3.5,0.6,0.05,None,None,name="h2_pressure"),
                 T("current","A",1800,900,15,None,None,name="excitation_current"),
                 T("vibration","mm/s",2.3,0.7,0.18,4.5,7.1,"both",name="bearing_vibration")],
}
# unit-level process tags (attached to the boiler equipment of each unit)
UNIT_TAGS = [
    T("level","mm",0,0,14,120,180,"both",name="drum_level_dev"),
    T("temperature","degC",537,6,2.0,566,571,"both",name="main_steam_temp"),
    T("pressure","bar",167,12,1.0,178,182,name="main_steam_pressure"),
    T("temperature","degC",537,6,2.0,566,571,name="reheat_steam_temp"),
    T("pressure","mbar",-2.0,0.5,0.4,3,6,name="furnace_pressure"),
    T("flow","kg/s",120,320,6.0,None,None,name="total_feedwater_flow"),
    T("flow","kg/s",5,25,2.0,None,None,name="superheat_spray_flow"),
    T("vacuum","mmHg",690,-25,2.5,None,None,"both",name="condenser_vacuum"),
    T("power","MW",0,1.0,0,None,None,"both",name="gross_mw"),
    T("power","MVAR",0,0.4,3,None,None,name="gross_mvar"),
    T("frequency","Hz",50.0,0,0.03,50.2,50.5,"both",name="grid_frequency"),
]

# --------------------------------------------------------------------------
# 1. MASTER: plants, units, tariff, beneficiaries
# --------------------------------------------------------------------------
insert("plants",
    ["plant_id","name","location","state","total_capacity_mw","fuel_type","commissioning_year","operator"],
    [(p["plant_id"],p["name"],p["location"],p["state"],
      sum(u["capacity_mw"] for u in C.UNITS if u["plant_id"]==p["plant_id"]),
      p["fuel_type"],p["commissioning_year"],p["operator"]) for p in C.PLANTS])

insert("units",
    ["unit_id","plant_id","name","capacity_mw","tech","commissioning_date","napaf_pct",
     "afc_cr_per_year","aux_consumption_norm_pct","heat_rate_norm","energy_charge_rate_inr_kwh"],
    [(u["unit_id"],u["plant_id"],u["name"],u["capacity_mw"],u["tech"],u["commissioning_date"],
      u["napaf_pct"],u["afc_cr_per_year"],u["aux_norm"],u["heat_rate_norm"],u["ec_rate"]) for u in C.UNITS])

# AFC breakdown (CERC cost-plus components) -> waterfall chart
AFC_SPLIT = [("return_on_equity",0.34),("depreciation",0.26),("interest_on_loan",0.20),
             ("o_and_m",0.15),("interest_on_working_capital",0.05)]
tc_rows=[]
for u in C.UNITS:
    afc = u["afc_cr_per_year"]*C.CRORE
    for comp,frac in AFC_SPLIT:
        tc_rows.append((u["unit_id"],comp,round(afc*frac,0),round(frac*100,1)))
insert("tariff_components",["unit_id","component","annual_inr","pct_of_afc"],tc_rows)

DISCOMS = {"VSTPS":[("MP DISCOM",0.28),("UP DISCOM",0.24),("Maharashtra DISCOM",0.20),
                    ("Gujarat DISCOM",0.16),("Chhattisgarh DISCOM",0.12)],
           "CSTPS":[("AP DISCOM",0.40),("Telangana DISCOM",0.30),("Tamil Nadu DISCOM",0.20),
                    ("Karnataka DISCOM",0.10)]}
b_rows=[]
for u in C.UNITS:
    for name,share in DISCOMS[u["plant_id"]]:
        b_rows.append((u["unit_id"],name,round(u["capacity_mw"]*share,1),round(share*100,1),
                       round(u["ec_rate"]+0.9+rng.uniform(-0.1,0.1),2)))
insert("beneficiaries",["unit_id","beneficiary","allocated_mw","share_pct","tariff_inr_kwh"],b_rows)

# --------------------------------------------------------------------------
# 2. EQUIPMENT (ISO 14224) + PROCESS TAGS
# --------------------------------------------------------------------------
equipment=[]          # dicts
eq_rows=[]
LETTERS="ABCDEFGH"
for u in C.UNITS:
    unum=u["unit_id"].split("U")[-1]
    for (count,typ,klass,system,crit,redun,monitored) in C.EQUIP_TEMPLATE:
        for i in range(count):
            suf=LETTERS[i] if count>1 else ""
            short={"coal_mill":"MILL","id_fan":"IDF","fd_fan":"FDF","pa_fan":"PAF",
                   "air_preheater":"APH","esp":"ESP","boiler":"BLR","boiler_feed_pump":"BFP",
                   "cep":"CEP","cw_pump":"CWP","condenser":"COND","steam_turbine":"TG",
                   "generator":"GEN","generator_transformer":"GT"}[typ]
            tagno=f"{unum}-{short}" + (f"-{suf}" if suf else "")
            eqid=f"{u['unit_id']}-{short}"+(f"-{suf}" if suf else "")
            nice=typ.replace("_"," ").title()+(f" {suf}" if suf else "")
            mtbf=rng.uniform(18000,52000)
            equipment.append(dict(equip_id=eqid,unit_id=u["unit_id"],type=typ,klass=klass,
                                  system=system,crit=crit,redun=redun,monitored=monitored,suf=suf))
            eq_rows.append((eqid,u["unit_id"],system,None,klass,tagno,f"{nice}",typ,
                            C.OEM_BY_CLASS.get(klass,"BHEL"),None,u["commissioning_date"],
                            crit,redun,None,round(mtbf,0),round(rng.uniform(25,35),0),
                            1 if monitored else 0))
# assign standby links for redundancy groups (pair consecutive same-type instances)
by_key={}
for e in equipment:
    by_key.setdefault((e["unit_id"],e["type"]),[]).append(e)
standby_updates=[]
for (uid,typ),grp in by_key.items():
    if len(grp)>=2 and grp[0]["redun"] in ("2x50%","2x100%","3x50%","N+1"):
        # last instance is the designated standby for the first
        standby_updates.append((grp[-1]["equip_id"], grp[0]["equip_id"]))
insert("equipment",
    ["equip_id","unit_id","system","subsystem","equipment_class","tag_no","name","type","oem",
     "rating","install_date","criticality","redundancy","standby_equip_id","mtbf_hours",
     "expected_life_years","monitored"], eq_rows)
for standby,owner in standby_updates:
    cur.execute("UPDATE equipment SET standby_equip_id=? WHERE equip_id=?",(standby,owner))

# process tags
tag_rows=[]; tags=[]   # tags: dict with tag_id, spec, equip, unit
tid=1
def add_tag(unit_id,equip_id,spec):
    global tid
    ename = equip_id.split("-")[-2:] if equip_id else [unit_id.split("-")[-1]]
    if equip_id:
        base_e=next(e for e in equipment if e["equip_id"]==equip_id)
        short=equip_id.replace(unit_id+"-","")
    else:
        short="UNIT"
    tagname=f"{unit_id.replace('-','.')}.{short}.{spec['name']}".upper()
    tags.append(dict(tag_id=tid,unit_id=unit_id,equip_id=equip_id,spec=spec))
    hi=spec["hi"]; hihi=spec["hihi"]
    if UNIT_TECH.get(unit_id)=="supercritical" and spec["name"] in SC_STEAM_TAGS:
        if hi is not None: hi+=SC_STEAM_OFFSET
        if hihi is not None: hihi+=SC_STEAM_OFFSET
    tag_rows.append((tid,tagname,unit_id,equip_id,spec["p"],spec["uom"],
                     None,spec.get("lo"),hi,hihi,
                     "both" if spec["tier"]=="both" else "hourly"))
    tid+=1
for e in equipment:
    for spec in TAG_SPECS.get(e["type"],[]):
        add_tag(e["unit_id"],e["equip_id"],spec)
for u in C.UNITS:
    blr=next(e["equip_id"] for e in equipment if e["unit_id"]==u["unit_id"] and e["type"]=="boiler")
    for spec in UNIT_TAGS:
        add_tag(u["unit_id"],blr,spec)
insert("process_tags",
    ["tag_id","tag_name","unit_id","equip_id","param_type","uom","lo_lo","lo","hi","hi_hi","tier"],
    tag_rows)
print(f"  tags: {len(tags)}  equipment: {len(equipment)}")

# --------------------------------------------------------------------------
# 3. FAILURE MODES (ISO 14224 catalog)
# --------------------------------------------------------------------------
FM=[("centrifugal_pump","vibration_high","fatigue/misalignment","vibration_analysis",48,"critical","BFP"),
    ("centrifugal_pump","bearing_failure","fatigue","vibration_analysis",72,"critical","BFP"),
    ("centrifugal_pump","seal_leakage","wear","process_deviation",24,"major","BFP"),
    ("mill","vibration_high","imbalance/wear","vibration_analysis",36,"major","MILL"),
    ("mill","roller_wear","erosion","inspection",96,"major","MILL"),
    ("fan","vibration_high","imbalance","vibration_analysis",36,"major","FAN"),
    ("fan","bearing_failure","fatigue","vibration_analysis",48,"critical","FAN"),
    ("fired_heater","tube_leak","erosion/corrosion","process_deviation",120,"critical","BTL"),
    ("steam_turbine","vibration_high","imbalance/rub","vibration_analysis",96,"critical","TURB_VIB"),
    ("steam_turbine","bearing_wipe","lube_failure","oil_analysis",120,"critical","TURB_VIB"),
    ("generator","insulation_degradation","thermal_ageing","thermography",168,"critical","GEN"),
    ("heat_exchanger","fouling","deposition","process_deviation",72,"major","COND_VAC"),
    ("electrostatic_precipitator","field_failure","electrical","process_deviation",24,"minor","ESP"),
    ("crusher","choke","blockage","process_deviation",12,"minor","CHP")]
insert("failure_modes",
    ["equipment_class","failure_mode","failure_mechanism","detection_method","typical_mttr_hours","severity","gads_cause_code"],
    [(*f,) for f in FM])
fm_id_by_mode={ (f[0],f[1]):i+1 for i,f in enumerate(FM) }

# --------------------------------------------------------------------------
# 4. LOAD PROFILES + planted historical outages
# --------------------------------------------------------------------------
# historical outage windows per unit: (start_days_ago, dur_hours, class, gads, cause, cause_desc, mw_red_frac)
OUTAGES={
 "VSTPS-U1":[(58,50,"forced","U1","MILL","Mill-B gearbox failure — forced derating",0.18)],
 "VSTPS-U2":[(41,74,"forced","U1","BTL","Boiler tube leak (platen SH) — forced outage",1.0)],
 "VSTPS-U3":[(70,10,"maintenance","MO","BFP","BFP-2C bearing replacement (standby taken out)",0.0)],
 "CSTPS-U1":[(63,168,"planned","PO","OVH","Planned overhaul — annual",1.0)],
 "CSTPS-U2":[(20,30,"forced","U1","COAL","Low imported-coal stock — partial derating",0.22)],
}
unit_load_frac={}   # hourly load fraction per unit
unit_state_15={}    # 15-min state string per unit
for u in C.UNITS:
    uid=u["unit_id"]; cap=u["capacity_mw"]
    hod=HOURLY_IST.hour.values; dow=HOURLY_IST.dayofweek.values
    base=0.86 if u["plant_id"]=="CSTPS" else 0.80
    diurnal=0.05*np.sin((hod-9)/24*2*np.pi)
    evening=np.where((hod>=18)&(hod<=22),0.05,0.0)
    weekend=np.where(dow>=5,-0.05,0.0)
    noise=rng.normal(0,0.02,len(hod))
    lf=np.clip(base+diurnal+evening+weekend+noise,0.5,1.0)
    # apply outages to hourly load
    for (sda,dur,klass,gads,cause,desc,red) in OUTAGES.get(uid,[]):
        start=NOW_EPOCH-sda*86400; end=start+dur*3600
        mask=(HOURLY_EP>=start)&(HOURLY_EP<end)
        lf=np.where(mask, lf*(1-red), lf)
    unit_load_frac[uid]=lf

# --------------------------------------------------------------------------
# 5. TELEMETRY (hourly, all tags) + 1-min (monitored) with degradation overlay
# --------------------------------------------------------------------------
def degrade_curve(epoch_arr, start_days_ago, base, now_val, power=2.2):
    days_ago=(NOW_EPOCH-epoch_arr)/86400.0
    frac=np.clip((start_days_ago-days_ago)/start_days_ago,0,1)
    return base+(now_val-base)*(frac**power)

# which equipment carry a planted degradation: (unit,type,suffix)->(base,now)
DEGRADE={}
g=C.GOLDEN
gbfp=f"{g['unit_id']}-BFP-{g['equip_suffix']}"
DEGRADE[gbfp]=dict(vib=(g["vib_baseline"],g["vib_now"]), start=g["degrade_start_days_ago"])
s=C.SECONDARY["mill_degrade"]
smill=f"{s['unit_id']}-MILL-{s['suffix']}"
DEGRADE[smill]=dict(vib=(s["vib_baseline"],s["vib_now"]), start=22)

def tag_values(spec, unit_id, equip_id, epoch_arr, lf_interp):
    p=spec["p"]
    if p=="power" and spec["name"]=="gross_mw":
        cap=next(u["capacity_mw"] for u in C.UNITS if u["unit_id"]==unit_id)
        return np.clip(lf_interp*cap*1.06 + rng.normal(0,2,len(epoch_arr)),0,cap*1.08)
    if p=="frequency":
        return np.clip(50.0+np.cumsum(rng.normal(0,0.004,len(epoch_arr)))*0.0+rng.normal(0,0.03,len(epoch_arr)),49.85,50.15)
    base=spec["base"]
    if p=="temperature" and spec["name"] in SC_STEAM_TAGS and UNIT_TECH.get(unit_id)=="supercritical":
        base=base+SC_STEAM_OFFSET                       # supercritical runs ~565 degC (limits shifted too)
    val=base+spec["gain"]*lf_interp+rng.normal(0,spec["noise"],len(epoch_arr))
    # degradation overlay for vibration/bearing_temp on planted equipment
    if equip_id in DEGRADE and p in ("vibration","bearing_temp"):
        d=DEGRADE[equip_id]
        if p=="vibration" and spec["name"] in ("vibration","rotor_vibration","bearing_vibration"):
            vb,vn=d["vib"]
            val=degrade_curve(epoch_arr,d["start"],vb,vn)+rng.normal(0,0.12,len(epoch_arr))
        if p=="bearing_temp":
            # bearing temp rises with vibration degradation
            vb,vn=d["vib"]
            extra=degrade_curve(epoch_arr,d["start"],0,(vn-vb)*6)
            val=val+extra
    return val

# interpolate hourly load to arbitrary epoch grid
def lf_on(unit_id, epoch_arr):
    return np.interp(epoch_arr, HOURLY_EP, unit_load_frac[unit_id])

print("  generating hourly telemetry ...")
def hourly_rows():
    for t in tags:
        uid=t["unit_id"]; lf=unit_load_frac[uid]
        vals=tag_values(t["spec"],uid,t["equip_id"],HOURLY_EP,lf)
        tid_=t["tag_id"]; ep=HOURLY_EP
        for e,v in zip(ep.tolist(), vals.tolist()):
            yield (tid_,int(e),round(v,3),192)
n_hourly=insert_chunked("telemetry",["tag_id","ts","value","quality"],hourly_rows())

print("  generating 1-min telemetry (monitored) ...")
min_tags=[t for t in tags if t["spec"]["tier"]=="both"]
def min_rows():
    for t in min_tags:
        uid=t["unit_id"]; lf=lf_on(uid,MIN_EP)
        vals=tag_values(t["spec"],uid,t["equip_id"],MIN_EP,lf)
        tid_=t["tag_id"]
        for e,v in zip(MIN_EP.tolist(), vals.tolist()):
            yield (tid_,int(e),round(v,3),192)
n_min=insert_chunked("telemetry_1min",["tag_id","ts","value","quality"],min_rows())
print(f"  telemetry rows: hourly={n_hourly:,} 1min={n_min:,}")

# --------------------------------------------------------------------------
# 6. CONDITION MONITORING (hourly per monitored asset) + health index
# --------------------------------------------------------------------------
def health_from(vib,btemp):
    v=np.clip((vib-2.0)/(7.1-2.0),0,1.3)
    tt=np.clip((btemp-70)/(105-70),0,1.2)
    return np.clip(100-62*v-28*np.clip(tt,0,1),2,99)

cm_rows=[]
health_now={}   # equip_id -> current health (for predictions/alerts)
for e in equipment:
    if not e["monitored"]: continue
    uid=e["unit_id"]; lf=unit_load_frac[uid]
    # vibration
    if e["equip_id"] in DEGRADE:
        d=DEGRADE[e["equip_id"]]; vb,vn=d["vib"]
        vib=degrade_curve(HOURLY_EP,d["start"],vb,vn)+rng.normal(0,0.12,len(HOURLY_EP))
        btemp=52+18*lf+degrade_curve(HOURLY_EP,d["start"],0,(vn-vb)*6)+rng.normal(0,1.2,len(HOURLY_EP))
    else:
        vib=2.1+0.6*lf+rng.normal(0,0.2,len(HOURLY_EP))
        btemp=52+18*lf+rng.normal(0,1.2,len(HOURLY_EP))
    vib_ax=vib*rng.uniform(0.5,0.7)
    btemp_nde=btemp-rng.uniform(2,6)
    wtemp=(60+30*lf+rng.normal(0,1.5,len(HOURLY_EP))) if e["type"] in ("generator",) else None
    oil=np.clip(16+4*(vib-2)+rng.normal(0,0.6,len(HOURLY_EP)),12,24)
    h=health_from(vib,btemp)
    health_now[e["equip_id"]]=float(h[-1])
    for i,ep in enumerate(HOURLY_EP.tolist()):
        cm_rows.append((e["equip_id"],int(ep),round(float(vib[i]),3),round(float(vib_ax[i]),3),
                        round(float(btemp[i]),2),round(float(btemp_nde[i]),2),
                        None if wtemp is None else round(float(wtemp[i]),2),
                        round(float(oil[i]),1),round(float(h[i]),1)))
n_cm=insert_chunked("condition_monitoring",
    ["equip_id","ts","vibration_mm_s","vibration_axial_mm_s","bearing_temp_de_c",
     "bearing_temp_nde_c","winding_temp_c","oil_particle_iso","health_index"],cm_rows)

# --------------------------------------------------------------------------
# 7. UNIT OPERATING STATE (15-min, 90d) + emissions + weather
# --------------------------------------------------------------------------
uos_rows=[]
for u in C.UNITS:
    uid=u["unit_id"]; cap=u["capacity_mw"]
    lf15=lf_on(uid,Q15_EP)
    load=lf15*cap+rng.normal(0,1.5,len(Q15_EP))
    state=np.where(lf15<0.05,"tripped",np.where(lf15<0.6,"derated","running"))
    # tag planned outages explicitly
    for (sda,dur,klass,gads,cause,desc,red) in OUTAGES.get(uid,[]):
        st=NOW_EPOCH-sda*86400; en=st+dur*3600
        m=(Q15_EP>=st)&(Q15_EP<en)
        if klass=="planned": state=np.where(m,"planned_outage",state)
        elif red>=0.99: state=np.where(m,"tripped",state)
    freq=np.clip(50.0+rng.normal(0,0.03,len(Q15_EP)),49.85,50.15)
    ramp=np.gradient(load)*4
    for i,ep in enumerate(Q15_EP.tolist()):
        uos_rows.append((uid,int(ep),round(float(max(load[i],0)),1),round(float(max(load[i]*1.06,0)),1),
                         str(state[i]),round(float(freq[i]),3),round(float(ramp[i]),2)))
n_uos=insert_chunked("unit_operating_state",
    ["unit_id","ts","load_mw","gross_mw","state","frequency_hz","ramp_mw_per_min"],uos_rows)

# emissions (hourly)
em_rows=[]
for u in C.UNITS:
    uid=u["unit_id"]; lf=unit_load_frac[uid]; n=len(HOURLY_EP)
    sox=np.clip(360+120*lf+rng.normal(0,25,n),150,590)              # CPCB SO2 norm 600
    nox_base=155 if u["tech"]=="supercritical" else 178
    nox=np.clip(nox_base+72*lf+rng.normal(0,12,n),110,290)          # CPCB NOx norm 300 (2004-16 units)
    if uid==C.SECONDARY["nox_exceed_unit"]:                          # one unit creeps up to the 300 limit
        nox=np.clip(nox+degrade_curve(HOURLY_EP,25,0,90),110,308)
    spm=np.clip(14+7*lf+rng.normal(0,3,n),5,45)                     # CPCB SPM norm 50
    co2=np.clip(lf*u["capacity_mw"]*0.95+rng.normal(0,10,n),0,None)
    o2=np.clip(6.5-1.5*lf+rng.normal(0,0.2,n),2,9)
    stk=np.clip(125+15*lf+rng.normal(0,3,n),100,160)
    for i,ep in enumerate(HOURLY_EP.tolist()):
        em_rows.append((uid,int(ep),round(float(sox[i]),1),round(float(nox[i]),1),round(float(spm[i]),1),
                        round(float(co2[i]),1),round(float(o2[i]),2),round(float(stk[i]),1)))
n_em=insert_chunked("emissions",
    ["unit_id","ts","sox_mg_nm3","nox_mg_nm3","spm_mg_nm3","co2_t_per_hr","o2_pct","stack_temp_c"],em_rows)

# ambient weather (hourly per plant)
w_rows=[]
for p in C.PLANTS:
    n=len(HOURLY_EP); hod=HOURLY_IST.hour.values
    amb=28+7*np.sin((hod-15)/24*2*np.pi)+rng.normal(0,1.2,n)+(3 if p["plant_id"]=="CSTPS" else 0)
    hum=np.clip((70 if p["plant_id"]=="CSTPS" else 45)+rng.normal(0,8,n),20,98)
    cw=np.clip(amb-2+rng.normal(0,0.8,n),20,42)
    for i,ep in enumerate(HOURLY_EP.tolist()):
        w_rows.append((p["plant_id"],int(ep),round(float(amb[i]),1),round(float(hum[i]),1),round(float(cw[i]),1)))
insert_chunked("ambient_weather",["plant_id","ts","ambient_temp_c","humidity_pct","cw_inlet_temp_c"],w_rows)

# --------------------------------------------------------------------------
# 8. DAILY ROLLUPS: performance_kpi, commitments, commercial_exposure, fuel
# --------------------------------------------------------------------------
def daily_mean_load(uid):
    # mean hourly load fraction per day
    df=pd.DataFrame({"ep":HOURLY_EP,"lf":unit_load_frac[uid]})
    df["day"]=((df["ep"]+C.TZ_OFFSET_SEC)//86400)
    return df.groupby("day")["lf"].mean().values

perf_rows=[]; commit_rows=[]; exp_rows=[]
quarter_lost={}
for u in C.UNITS:
    uid=u["unit_id"]; cap=u["capacity_mw"]; napaf=u["napaf_pct"]
    afc_day=u["afc_cr_per_year"]*C.CRORE/365.0
    nominal_gcv=3600 if u["plant_id"]=="VSTPS" else 5200      # for specific-coal-consumption = SHR/GCV
    # dates the unit is in a PLANNED outage — capacity-charge recovery is protected (NAPAF already
    # accounts for planned maintenance), so no under-recovery is booked on these days.
    planned_days=set()
    for (sda,dur,klass,gads,cause,desc,red) in OUTAGES.get(uid,[]):
        if klass=="planned":
            st=ANCHOR-pd.Timedelta(days=sda)
            for h in range(int(dur)+24):
                planned_days.add((st+pd.Timedelta(hours=h)).strftime("%Y-%m-%d"))
    dlf=daily_mean_load(uid)[-C.HISTORY_DAYS:]
    for i,day in enumerate(DAY_STR):
        lf=float(dlf[i]) if i<len(dlf) else 0.8
        # availability: high unless load ~0 (outage). VSTPS-U3 kept precarious ~ just above napaf.
        avail = 0.0 if lf<0.05 else (1.0 if lf>0.55 else 0.75)
        # daily PAF: declared capacity availability. base near napaf for U3, healthier others.
        if uid=="VSTPS-U3":
            paf=np.clip(rng.normal(84.5,1.2),0,100) if avail>0 else rng.uniform(0,20)
        else:
            paf=np.clip(rng.normal(89 if u["plant_id"]=="VSTPS" else 90,1.5),0,100) if avail>0 else rng.uniform(0,25)
        plf=lf*100
        gen=lf*cap*24*(1-u["aux_norm"]/100)
        shr=u["heat_rate_norm"]*(1+rng.normal(0.03,0.015))*(1.0 if lf>0.7 else 1.05)
        aux=u["aux_norm"]+rng.normal(0.3,0.2)+ (0.4 if lf<0.6 else 0)
        scc=shr/nominal_gcv+rng.normal(0,0.005)     # specific coal consumption = SHR / GCV (kg/kWh)
        eff=round(860/shr*100,2)
        perf_rows.append((uid,day,round(plf,1),round(float(paf),1),round(shr,0),
                          round((shr/u["heat_rate_norm"]-1)*100,2),round(aux,2),
                          round(scc,3),round(rng.uniform(0.3,0.8),2),eff,round(gen,0)))
        # commitments
        dc=cap*(paf/100.0)
        sched=gen*rng.uniform(0.96,1.02)
        actual=gen*rng.uniform(0.97,1.01) if avail>0 else 0.0
        commit_rows.append((uid,day,round(dc,1),round(sched,0),round(actual,0),round(float(paf),1),round(plf,1)))
        # commercial exposure (CERC formula components)
        earned=afc_day*min(paf/napaf,1.0)
        lost=0.0 if day in planned_days else max(afc_day-earned,0.0)   # planned outage: recovery protected
        dev=(actual-sched)/1000.0*1000  # mwh deviation (actual-sched)
        dev_mwh=(actual-sched)
        dsm=max(-dev_mwh,0)*C.DSM_RATE_INR_MWH*0.6   # under-injection penalty
        rtm_mwh=max(sched-actual,0) if avail<1 else 0
        exch=C.RTM_BASE_INR_MWH+rng.uniform(-400,1200)
        rtm_cost=rtm_mwh*max(exch-u["ec_rate"]*1000,0)*0.5
        net=lost+dsm+rtm_cost
        quarter_lost[uid]=quarter_lost.get(uid,0)+net
        exp_rows.append((uid,day,round(earned,0),round(lost,0),round(actual*u["ec_rate"]*1000,0),
                         round(dev_mwh,1),round(dsm,0),round(rtm_mwh,1),round(rtm_cost,0),
                         round(exch,0),round(net,0)))
insert("performance_kpi",
    ["unit_id","date","plf_pct","paf_pct","station_heat_rate_kcal_kwh","heat_rate_deviation_pct",
     "aux_consumption_pct","specific_coal_consumption_kg_kwh","specific_oil_ml_kwh",
     "thermal_efficiency_pct","generation_mwh"],perf_rows)
insert("commitments",
    ["unit_id","date","declared_capacity_mw","scheduled_mwh","actual_mwh","paf_pct","plf_pct"],commit_rows)
insert("commercial_exposure",
    ["unit_id","date","capacity_charge_earned_inr","capacity_charge_lost_inr","energy_charge_inr",
     "dsm_deviation_mwh","dsm_charge_inr","rtm_replacement_mwh","rtm_replacement_cost_inr",
     "exchange_price_inr_mwh","net_exposure_inr"],exp_rows)

# fuel stock (daily per plant) with CSTPS imported-coal dip
fuel_rows=[]
for p in C.PLANTS:
    pid=p["plant_id"]
    plant_cap=sum(u["capacity_mw"] for u in C.UNITS if u["plant_id"]==pid)
    burn0=plant_cap*24*0.0006*1000/1.0   # rough tonnes/day
    stock=plant_cap*22*10   # start ~ 22 days
    for i,day in enumerate(DAY_STR):
        gcv=(3600 if pid=="VSTPS" else 5200)+rng.normal(0,120)
        burn=burn0*rng.uniform(0.9,1.05)*(3800/gcv if pid=="VSTPS" else 5200/gcv)
        receipt=burn*rng.uniform(0.85,1.15)
        if pid==C.SECONDARY["coal_low_plant"] and i>C.HISTORY_DAYS-18:  # taper down recently
            receipt=burn*rng.uniform(0.4,0.7)
        stock=max(stock-burn+receipt,burn*1.5)
        days_of=stock/burn
        if pid==C.SECONDARY["coal_low_plant"] and i==C.HISTORY_DAYS-1:
            days_of=C.SECONDARY["coal_days_now"]; stock=days_of*burn
        fuel_rows.append((pid,day,round(stock,0),round(days_of,1),round(burn,0),round(gcv,0),
                          round(rng.uniform(8,14),1),round(rng.uniform(32,42),1),
                          round((2600 if pid=="VSTPS" else 7200)+rng.normal(0,150),0),
                          "linkage" if pid=="VSTPS" else "imported"))
insert("fuel_stock",
    ["plant_id","date","coal_stock_mt","days_of_coal","daily_burn_mt","gcv_kcal_kg","moisture_pct",
     "ash_pct","cost_inr_per_mt","source"],fuel_rows)

# --------------------------------------------------------------------------
# 9. SCHEDULE BLOCKS (15-min, recent) + MARKET PRICES (15-min, 90d)
# --------------------------------------------------------------------------
sb_rows=[]
for u in C.UNITS:
    uid=u["unit_id"]; cap=u["capacity_mw"]
    lf=lf_on(uid,SCHED_EP)
    sched=lf*cap; actual=sched*rng.uniform(0.97,1.02,len(SCHED_EP))
    dc=cap*np.clip(lf+0.08,0,1)
    freq=np.clip(50.0+rng.normal(0,0.03,len(SCHED_EP)),49.85,50.15)
    for i,ep in enumerate(SCHED_EP.tolist()):
        sb_rows.append((uid,int(ep),round(float(sched[i]),1),round(float(actual[i]),1),
                        round(float(dc[i]),1),round(float(freq[i]),3)))
insert_chunked("schedule_blocks",
    ["unit_id","ts","scheduled_mw","actual_mw","declared_mw","frequency_hz"],sb_rows)

mp_rows=[]
hod15=Q15_IST.hour.values
for market,mult in (("DAM",1.0),("RTM",1.08)):
    peak=np.where((hod15>=18)&(hod15<=23),1.0,0.0)+np.where((hod15>=6)&(hod15<=9),0.5,0.0)
    price=(C.RTM_BASE_INR_MWH*mult)+peak*(C.RTM_PEAK_INR_MWH-C.RTM_BASE_INR_MWH)*0.7+rng.normal(0,300,len(Q15_EP))
    price=np.clip(price,1800,11000)
    for i,ep in enumerate(Q15_EP.tolist()):
        mp_rows.append((int(ep),market,"A1",round(float(price[i]),0)))
insert_chunked("market_prices",["ts","market","region","price_inr_mwh"],mp_rows)

# --------------------------------------------------------------------------
# 10. WORK ORDERS, OUTAGE EVENTS, RELIABILITY, SPARES, POs
# --------------------------------------------------------------------------
def dstr(days_ago): return (ANCHOR - pd.Timedelta(days=days_ago)).strftime("%Y-%m-%d")

wo_rows=[]; wid=1000
# preventive PMs across monitored equipment
for e in equipment:
    if rng.random()<0.5 or e["monitored"]:
        freq=rng.choice([30,90,180])
        nd=dstr(-int(rng.uniform(2,freq)))   # future due
        wo_rows.append((f"WO-2026-{wid:05d}",e["equip_id"],"preventive","scheduled","normal",None,
                        f"Routine PM ({freq}d) — {e['type'].replace('_',' ')}",dstr(int(rng.uniform(20,80))),
                        nd,None,None,round(rng.uniform(4,24),1),round(rng.uniform(20000,120000),0),int(freq),nd)); wid+=1
# historical breakdown WOs tied to outages
for uid,lst in OUTAGES.items():
    for (sda,dur,klass,gads,cause,desc,red) in lst:
        eq=next((e for e in equipment if e["unit_id"]==uid and cause[:3].lower() in e["type"].lower()),None)
        eq=eq or next(e for e in equipment if e["unit_id"]==uid and e["type"]=="boiler")
        wo_rows.append((f"WO-2026-{wid:05d}",eq["equip_id"],"breakdown","completed",
                        "emergency" if red>=1 else "high",None,desc,dstr(sda),dstr(sda),
                        dstr(sda-dur/24),dstr(sda-dur/24),round(dur*rng.uniform(1.5,3),1),
                        round(rng.uniform(5,60)*1e5,0),None,None)); wid+=1

# GOLDEN: BFP-2C standby is out on maintenance (open) — the "no healthy standby"
bfp2c=f"{g['unit_id']}-BFP-{g['standby_suffix']}"
wo_rows.append((f"WO-2026-{wid:05d}",bfp2c,"breakdown","in_progress","high",
                fm_id_by_mode[("centrifugal_pump","bearing_failure")],
                "BFP-2C mechanical seal + bearing overhaul — standby unavailable",dstr(9),dstr(9),
                dstr(-6),None,120.0,4200000,None,None)); wid+=1
# GOLDEN: BFP-2A predictive WO (raised by Ballast)
wo_rows.append((f"WO-2026-{wid:05d}",gbfp,"predictive","open","high",
                fm_id_by_mode[("centrifugal_pump","vibration_high")],
                "Rising vibration trend on BFP-2A DE bearing — predicted failure ~5 days (Ballast)",
                dstr(1),dstr(-2),dstr(-4),None,None,None,None,None)); wid+=1
insert("work_orders",
    ["wo_id","equip_id","type","status","priority","fm_id","description","created_ts","planned_start",
     "planned_end","actual_end","labor_hours","cost_inr","pm_frequency_days","next_due"],wo_rows)

# outage events
oe_rows=[]; oid=1
for uid,lst in OUTAGES.items():
    for (sda,dur,klass,gads,cause,desc,red) in lst:
        cap=next(u["capacity_mw"] for u in C.UNITS if u["unit_id"]==uid)
        mwh=(cap*red)*dur
        oe_rows.append((f"OUT-{oid:04d}",uid,None,gads,klass,dstr(sda),dstr(sda-dur/24),
                        round(dur,1),cause,desc,round(cap*red,0),round(mwh,0))); oid+=1
insert("outage_events",
    ["outage_id","unit_id","equip_id","gads_event_type","class","start_ts","end_ts","duration_hours",
     "cause_code","cause_desc","mw_reduction","mwh_lost"],oe_rows)

# reliability metrics (monthly per unit) from daily paf + outages
cm_perf=pd.DataFrame(perf_rows,columns=["unit_id","date","plf","paf","shr","hrdev","aux","scc","oil","eff","gen"])
cm_perf["month"]=cm_perf["date"].str[:7]
rel_rows=[]
for (uid,month),grp in cm_perf.groupby(["unit_id","month"]):
    eaf=grp["paf"].mean()
    trips=sum(1 for _ in OUTAGES.get(uid,[]) if True)
    efor=max(0.0, (85-eaf))*rng.uniform(0.2,0.5)
    rel_rows.append((uid,month,round(eaf,2),round(max(0,90-eaf),2),round(efor,2),round(efor*1.1,2),
                     round(eaf,2),round(rng.uniform(2000,6000),0),round(rng.uniform(24,120),1),
                     int(rng.integers(0,3)),int(trips)))
insert("reliability_metrics",
    ["unit_id","month","eaf_pct","ef_pct","efor_pct","eford_pct","availability_pct","mtbf_hours",
     "mttr_hours","starts","trips"],rel_rows)

# spares + BOM + POs
SPARES=[("SP-BRG-BFP-THR","Thrust bearing assembly, BFP","boiler_feed_pump",0,1,C.GOLDEN["spare_lead_time_days"],1850000,1,"KSB India","WH-Central"),
        ("SP-BRG-BFP-JRNL","Journal bearing, BFP","boiler_feed_pump",2,2,30,650000,1,"KSB India","WH-Central"),
        ("SP-SEAL-BFP","Mechanical seal cartridge, BFP","boiler_feed_pump",3,2,21,320000,1,"EagleBurgmann","WH-Central"),
        ("SP-MILL-ROLL","Grinding roll, mill","coal_mill",4,3,45,540000,1,"BHEL","WH-Mill"),
        ("SP-MILL-BRG","Mill bearing set","coal_mill",5,3,28,410000,0,"SKF","WH-Mill"),
        ("SP-FAN-BRG","ID/FD fan bearing","fan",6,4,20,180000,0,"SKF","WH-Central"),
        ("SP-CWP-IMP","CW pump impeller","cw_pump",1,1,60,1250000,1,"KSB India","WH-Cooling"),
        ("SP-TG-BRG","Turbine journal bearing","steam_turbine",1,1,90,3200000,1,"BHEL","WH-TG"),
        ("SP-GEN-RTD","Generator RTD sensor set","generator",8,4,15,95000,0,"BHEL","WH-TG"),
        ("SP-ESP-FIELD","ESP field controller card","esp",5,3,25,220000,0,"BHEL","WH-Elec")]
insert("spares_inventory",
    ["part_id","name","equip_type","on_hand_qty","reorder_level","lead_time_days","unit_cost_inr",
     "is_critical","supplier","warehouse"],SPARES)
# BOM: link spares to equipment by type
bom_rows=[]
for e in equipment:
    for sp in SPARES:
        if sp[2]==e["type"]:
            bom_rows.append((e["equip_id"],sp[0],int(rng.integers(1,3))))
insert("equipment_spares",["equip_id","part_id","qty_per_overhaul"],bom_rows)
# POs: the golden bearing PO that arrives too late + a few normal ones
po_rows=[("PO-2026-3391","SP-BRG-BFP-THR",1,dstr(2),dstr(-C.GOLDEN["po_eta_days"]),"in_transit",1850000,0),
         ("PO-2026-3402","SP-MILL-BRG",2,dstr(5),dstr(-6),"in_transit",410000,0),
         ("PO-2026-3410","SP-FAN-BRG",4,dstr(1),dstr(-12),"open",180000,0)]
insert("purchase_orders",["po_id","part_id","qty","order_date","eta","status","unit_cost_inr","expedited"],po_rows)

# --------------------------------------------------------------------------
# 11. BALLAST AI OUTPUTS: failure_predictions + alerts
# --------------------------------------------------------------------------
# projected ₹ at risk if BFP-2A trips: derate VSTPS-U3 -> PAF below NAPAF for repair window
u3=next(u for u in C.UNITS if u["unit_id"]=="VSTPS-U3")
afc_day_u3=u3["afc_cr_per_year"]*C.CRORE/365.0
derate_frac=1-C.GOLDEN["derate_to_pct"]/100.0
repair_days=3
# PAF would fall ~ derate_frac over repair window -> lost capacity charge + RTM
proj_paf=84.5-derate_frac*100*(repair_days/30.0)*3
lost_cc=afc_day_u3*(1-min(proj_paf/u3["napaf_pct"],1))*repair_days
rtm=derate_frac*u3["capacity_mw"]*24*repair_days*(C.RTM_PEAK_INR_MWH-u3["ec_rate"]*1000)*0.5
bfp_risk=round(lost_cc+rtm,0)

pred_rows=[
 (gbfp,dstr(0),dstr(-C.GOLDEN["rul_days"]),C.GOLDEN["rul_days"],C.GOLDEN["confidence_pct"],0.91,
  "vibration_high","Expedite thrust bearing SP-BRG-BFP-THR (14d lead — air-freight); return BFP-2C to service by closing WO; if unavailable, pre-emptively derate U3 to protect grid commitment.",
  bfp_risk,"active"),
 (smill,dstr(0),dstr(-18),18,72,0.63,"vibration_high",
  "Monitor Mill-C vibration; schedule roll inspection at next reserve shutdown.",round(afc_day_u3*0.15,0),"active"),
]
# a couple of low-severity predictions for other monitored assets nearing PM
for e in rng.choice([e for e in equipment if e["monitored"] and e["equip_id"] not in (gbfp,smill)],3,replace=False):
    pred_rows.append((e["equip_id"],dstr(0),dstr(-int(rng.uniform(25,60))),int(rng.uniform(25,60)),
                      int(rng.uniform(45,65)),round(rng.uniform(0.2,0.4),2),"bearing_failure",
                      "Within normal range; continue condition-based monitoring.",0,"active"))
insert("failure_predictions",
    ["equip_id","generated_ts","predicted_failure_date","rul_days","confidence_pct","anomaly_score",
     "failure_mode","recommended_action","rupees_at_risk","status"],pred_rows)

# alerts (live stream)
cur_vib=cur.execute("SELECT vibration_mm_s FROM condition_monitoring WHERE equip_id=? ORDER BY ts DESC LIMIT 1",(gbfp,)).fetchone()[0]
al_rows=[
 (NOW_EPOCH-3600, "VSTPS-U3", gbfp, "critical","condition",
  "BFP-2A failure predicted in ~5 days",
  "Vibration %.1f mm/s and rising (ISO 10816 danger 7.1). Standby BFP-2C is out on maintenance (WO in progress). Spare thrust bearing out of stock (14-day lead). Projected exposure if it trips: ₹%.2f Cr."%(cur_vib,bfp_risk/C.CRORE),
  bfp_risk,"active","BFP-2A DE vibration + no standby + spare stockout"),
 (NOW_EPOCH-7200, "CSTPS", None, "warning","fuel",
  "Coal stock at %.1f days (below 4-day critical)"%C.SECONDARY["coal_days_now"],
  "Imported-coal receipts lagging burn at CSTPS. Risk of derating both units if not replenished.",
  0,"active","fuel_stock.days_of_coal"),
 (NOW_EPOCH-10800, C.SECONDARY["nox_exceed_unit"], None, "warning","emission",
  "NOx trending toward CPCB limit",
  "NOx creeping up over the last 3 weeks; approaching the stack limit. Check combustion tuning / SCR.",
  0,"active","emissions.nox_mg_nm3"),
 (NOW_EPOCH-14400, "VSTPS-U1", smill, "info","condition",
  "Mill-C mild vibration elevation",
  "Mill-C vibration 4.9 mm/s (alert 4.5). Low anomaly score; monitor.",0,"active","MILL-C vibration"),
]
insert("alerts",["ts","unit_id","equip_id","severity","category","title","message","rupees_at_risk","status","source"],al_rows)

# --------------------------------------------------------------------------
# 12. META + VIEWS + finalize
# --------------------------------------------------------------------------
insert("data_meta",["key","value"],[
    ("schema_version","1.0"),("seed",str(C.SEED)),("generated_at",ANCHOR.strftime("%Y-%m-%d %H:%M:%S")),
    ("clock_now",str(NOW_EPOCH)),("tz_offset_seconds",str(C.TZ_OFFSET_SEC)),
    ("history_start",str(int(HOURLY_EP[0]))),("history_end",str(NOW_EPOCH)),
    ("golden_equip",gbfp),("golden_unit","VSTPS-U3"),
])

conn.executescript("""
CREATE VIEW v_equipment_health_now AS
  SELECT e.equip_id,e.unit_id,e.name,e.type,e.criticality,e.redundancy,e.standby_equip_id,
         cm.vibration_mm_s,cm.bearing_temp_de_c,cm.health_index,cm.ts AS ts
  FROM equipment e
  JOIN condition_monitoring cm ON cm.equip_id=e.equip_id
  WHERE cm.ts=(SELECT MAX(ts) FROM condition_monitoring c2 WHERE c2.equip_id=e.equip_id);

CREATE VIEW v_unit_latest_state AS
  SELECT u.unit_id,u.name,u.capacity_mw,u.napaf_pct,s.load_mw,s.state,s.frequency_hz,s.ts
  FROM units u
  JOIN unit_operating_state s ON s.unit_id=u.unit_id
  WHERE s.ts=(SELECT MAX(ts) FROM unit_operating_state s2 WHERE s2.unit_id=u.unit_id);

CREATE VIEW v_exposure_90d AS
  SELECT unit_id,
         ROUND(SUM(capacity_charge_lost_inr)/10000000.0,2) AS cc_lost_cr,
         ROUND(SUM(dsm_charge_inr)/10000000.0,2)          AS dsm_cr,
         ROUND(SUM(rtm_replacement_cost_inr)/10000000.0,2) AS rtm_cr,
         ROUND(SUM(net_exposure_inr)/10000000.0,2)         AS net_exposure_cr
  FROM commercial_exposure GROUP BY unit_id;

CREATE VIEW v_active_alerts AS
  SELECT a.*, e.name AS equip_name FROM alerts a
  LEFT JOIN equipment e ON e.equip_id=a.equip_id
  WHERE a.status='active' ORDER BY
    CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.ts DESC;
""")

conn.commit()
conn.execute("ANALYZE")
conn.commit()

# summary
print("\n=== Ballast DB generated ===")
for tbl in ["plants","units","equipment","process_tags","failure_modes","telemetry","telemetry_1min",
            "condition_monitoring","unit_operating_state","emissions","ambient_weather","performance_kpi",
            "commitments","commercial_exposure","fuel_stock","schedule_blocks","market_prices",
            "work_orders","outage_events","reliability_metrics","failure_predictions","alerts",
            "spares_inventory","equipment_spares","purchase_orders","tariff_components","beneficiaries"]:
    n=conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
    print(f"  {tbl:24s} {n:>10,}")
size=os.path.getsize(DB)/1e6
print(f"\n  DB size: {size:.1f} MB   golden: {gbfp}  projected ₹ at risk: {bfp_risk/C.CRORE:.2f} Cr")
conn.close()
