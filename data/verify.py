#!/usr/bin/env python3
"""
Ballast — data-layer verification / golden-traversal proof.

Runs the golden query as a chain of SQL steps across all source systems and
prints the narrative Ballast would render. If this reads like the pitch, the
data layer is correct. Also runs sanity checks and prints PASS/FAIL.

Run:  python3 verify.py
"""
import os, sqlite3
HERE=os.path.dirname(os.path.abspath(__file__))
conn=sqlite3.connect(os.path.join(HERE,"ballast.db"))
conn.row_factory=sqlite3.Row
q=lambda s,*a: conn.execute(s,a).fetchall()
one=lambda s,*a: conn.execute(s,a).fetchone()
CR=1e7
def hdr(t): print("\n"+"="*72+"\n "+t+"\n"+"="*72)

GEQ="VSTPS-U3-BFP-A"
checks=[]

hdr("GOLDEN TRAVERSAL — \"BFP-2A vibration is rising. What's my exposure if it trips this week?\"")

# 1. condition / prediction  [DCS/HIST + BALLAST]
r=one("""SELECT e.name,e.unit_id,e.criticality,e.redundancy,cm.vibration_mm_s,cm.health_index
         FROM v_equipment_health_now cm JOIN equipment e USING(equip_id) WHERE equip_id=?""",GEQ)
p=one("SELECT * FROM failure_predictions WHERE equip_id=?",GEQ)
print(f"\n[1] CONDITION  ({r['unit_id']})  ← DCS/Historian + Ballast AI")
print(f"    {r['name']} | criticality {r['criticality']} | redundancy {r['redundancy']}")
print(f"    vibration = {r['vibration_mm_s']:.2f} mm/s (ISO 10816: 4.5 alert, 7.1 danger) | health {r['health_index']:.0f}/100")
print(f"    PREDICTION: fails in ~{p['rul_days']:.0f} days ({p['predicted_failure_date']}), confidence {p['confidence_pct']:.0f}%")
checks.append(("BFP-2A vibration in alert band (>4.5)", r["vibration_mm_s"]>4.5))
checks.append(("BFP-2A health degraded (<50)", r["health_index"]<50))

# 2. standby availability  [CMMS]
sb=one("SELECT standby_equip_id FROM equipment WHERE equip_id=?",GEQ)["standby_equip_id"]
wo=one("SELECT wo_id,status,description FROM work_orders WHERE equip_id=? AND status IN('open','in_progress')",sb)
print(f"\n[2] REDUNDANCY  ← CMMS (SAP PM / Maximo)")
print(f"    designated standby = {sb}")
if wo:
    print(f"    ⚠ standby UNAVAILABLE: {wo['wo_id']} [{wo['status']}] — {wo['description']}")
checks.append(("standby BFP has an open/in-progress WO (no healthy standby)", wo is not None))

# 3. spare availability  [CMMS/ERP]
sp=one("SELECT * FROM spares_inventory WHERE part_id='SP-BRG-BFP-THR'")
po=one("SELECT * FROM purchase_orders WHERE part_id='SP-BRG-BFP-THR' ORDER BY eta LIMIT 1")
print(f"\n[3] SPARES  ← CMMS/ERP")
print(f"    {sp['name']}: on-hand {sp['on_hand_qty']} | lead time {sp['lead_time_days']}d | critical={bool(sp['is_critical'])}")
if po: print(f"    incoming {po['po_id']} [{po['status']}] ETA {po['eta']}  → likely too late")
checks.append(("spare bearing out of stock", sp["on_hand_qty"]==0))
checks.append(("spare lead time >= 10 days", sp["lead_time_days"]>=10))

# 4. availability margin  [COMM]
u=one("SELECT napaf_pct,afc_cr_per_year,capacity_mw FROM units WHERE unit_id='VSTPS-U3'")
paf=one("""SELECT AVG(paf_pct) a FROM performance_kpi WHERE unit_id='VSTPS-U3'
           AND date>=date((SELECT CAST(value AS INT) FROM data_meta WHERE key='clock_now'),'unixepoch','-30 days')""")["a"]
print(f"\n[4] AVAILABILITY MARGIN  ← Commercial/Scheduling (CERC ABT)")
print(f"    VSTPS-U3: NAPAF {u['napaf_pct']:.0f}% | 30d PAF {paf:.1f}% | AFC ₹{u['afc_cr_per_year']:.0f} Cr/yr")
print(f"    margin above NAPAF = {paf-u['napaf_pct']:.1f} pts → a derating pushes PAF below NAPAF")
checks.append(("PAF currently above NAPAF but thin (<4 pts)", 0<paf-u["napaf_pct"]<4))

# 5. rupee exposure  [BALLAST synthesis over COMM]
print(f"\n[5] ₹ EXPOSURE  ← Ballast synthesis")
print(f"    projected if BFP-2A trips & U3 derates: ₹{p['rupees_at_risk']/CR:.2f} Cr")
print(f"    (capacity-charge under-recovery + DSM penalty + IEX RTM replacement)")
print(f"\n    RECOMMENDATION: {p['recommended_action']}")
checks.append(("projected rupees_at_risk > ₹1 Cr", p["rupees_at_risk"]>1*CR))

# context: historical exposure
hdr("CONTEXT — 90-day realized exposure by unit (what already leaked)")
for e in q("SELECT * FROM v_exposure_90d ORDER BY net_exposure_cr DESC"):
    print(f"    {e['unit_id']:10s} net ₹{e['net_exposure_cr']:6.2f} Cr  (CC lost {e['cc_lost_cr']:.2f} | DSM {e['dsm_cr']:.2f} | RTM {e['rtm_cr']:.2f})")

hdr("ACTIVE ALERTS (live stream)")
for a in q("SELECT severity,title,rupees_at_risk FROM v_active_alerts"):
    risk=f"  [₹{a['rupees_at_risk']/CR:.2f} Cr]" if a['rupees_at_risk'] else ""
    print(f"    [{a['severity'].upper():8s}] {a['title']}{risk}")

# data-integrity sanity checks
hdr("SANITY CHECKS")
checks += [
 ("5 units across 2 plants", one("SELECT COUNT(*) c FROM units")["c"]==5 and one("SELECT COUNT(*) c FROM plants")["c"]==2),
 ("telemetry hourly ~1M rows", one("SELECT COUNT(*) c FROM telemetry")["c"]>900_000),
 ("telemetry_1min > 4M rows", one("SELECT COUNT(*) c FROM telemetry_1min")["c"]>4_000_000),
 ("every process_tag resolvable to a unit", one("SELECT COUNT(*) c FROM process_tags WHERE unit_id IS NULL")["c"]==0),
 ("no orphan telemetry tags", one("SELECT COUNT(*) c FROM telemetry t LEFT JOIN process_tags p USING(tag_id) WHERE p.tag_id IS NULL")["c"]==0),
 ("coal-low secondary scenario present", one("SELECT MIN(days_of_coal) m FROM fuel_stock WHERE plant_id='CSTPS'")["m"]<4),
 ("clock_now set", one("SELECT value FROM data_meta WHERE key='clock_now'") is not None),
 ("views return rows", one("SELECT COUNT(*) c FROM v_active_alerts")["c"]>0),
]
ok=0
for name,cond in checks:
    print(f"    [{'PASS' if cond else 'FAIL'}] {name}")
    ok+=bool(cond)
print(f"\n  {ok}/{len(checks)} checks passed")
conn.close()
raise SystemExit(0 if ok==len(checks) else 1)
