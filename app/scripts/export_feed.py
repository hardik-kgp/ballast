#!/usr/bin/env python3
"""Export a UI feed (feed.json) from ballast.db.

Captures the schema of the ballast data layer into the shapes the console
plots: unit fleet state, schedule vs actual, the golden vibration trend,
IEX prices, commercial exposure, predictions and alerts. Run after
data/generate.py:

    python scripts/export_feed.py
"""
import json
import os
import sqlite3
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.normpath(os.path.join(HERE, "..", "..", "data", "ballast.db"))
OUT = os.path.normpath(os.path.join(HERE, "..", "src", "data", "feed.json"))

IST_OFFSET = 19800
VIB_ALERT = 4.5
VIB_DANGER = 7.1
CRORE = 1e7

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row


def q(sql, args=()):
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def ist_hhmm(epoch):
    t = (epoch + IST_OFFSET) % 86400
    return f"{t // 3600:02d}:{(t % 3600) // 60:02d}"


def ist_date(epoch):
    import datetime as dt

    return dt.datetime.utcfromtimestamp(epoch + IST_OFFSET).strftime("%b %d")


meta = {r["key"]: r["value"] for r in q("SELECT key, value FROM data_meta")}
now = int(float(meta["clock_now"]))
golden_equip = meta["golden_equip"]
golden_unit = meta["golden_unit"]

units = q(
    """SELECT u.unit_id, u.plant_id, u.name, u.capacity_mw, u.napaf_pct, p.name AS plant_name
       FROM units u JOIN plants p ON p.plant_id = u.plant_id ORDER BY u.unit_id"""
)
latest_state = {r["unit_id"]: r for r in q("SELECT * FROM v_unit_latest_state")}

health_rows = q("SELECT * FROM v_equipment_health_now")
worst_by_unit = {}
for r in health_rows:
    cur = worst_by_unit.get(r["unit_id"])
    if cur is None or (r["health_index"] or 100) < (cur["health_index"] or 100):
        worst_by_unit[r["unit_id"]] = r

preds = q(
    """SELECT fp.*, e.name AS equip_name, e.tag_no, e.unit_id
       FROM failure_predictions fp JOIN equipment e ON e.equip_id = fp.equip_id
       WHERE fp.status = 'active' ORDER BY fp.rupees_at_risk DESC"""
)
pred_by_unit = defaultdict(list)
for p in preds:
    pred_by_unit[p["unit_id"]].append(p)

trend_rows = q(
    """SELECT unit_id, ts, load_mw FROM unit_operating_state
       WHERE ts > ? ORDER BY ts""",
    (now - 8 * 3600,),
)
trend_by_unit = defaultdict(list)
for r in trend_rows:
    trend_by_unit[r["unit_id"]].append(r)

unit_feed = []
for u in units:
    uid = u["unit_id"]
    st = latest_state.get(uid, {})
    worst = worst_by_unit.get(uid, {})
    unit_preds = pred_by_unit.get(uid, [])
    top_pred = unit_preds[0] if unit_preds else None
    state = st.get("state", "running")
    if state in ("planned_outage", "maintenance", "reserve_shutdown"):
        status = "maintenance"
    elif top_pred and top_pred["rul_days"] <= 7:
        status = "at_risk"
    elif (worst.get("health_index") or 100) < 75 or state == "derated":
        status = "watch"
    else:
        status = "nominal"
    risk = (
        round(top_pred["confidence_pct"] * 0.9) if top_pred and top_pred["rul_days"] <= 7
        else round(max(0, 100 - (worst.get("health_index") or 100)) * 0.8)
    )
    samples = trend_by_unit.get(uid, [])[::4][-8:]
    unit_feed.append(
        {
            "unitId": uid,
            "plantId": u["plant_id"],
            "plantName": u["plant_name"],
            "name": f"{u['plant_id']} {u['name']}",
            "capacityMw": u["capacity_mw"],
            "loadMw": round(st.get("load_mw") or 0),
            "state": state,
            "status": status,
            "healthIndex": round(worst.get("health_index") or 100),
            "worstEquip": worst.get("name"),
            "vibrationMmS": round(worst.get("vibration_mm_s") or 0, 1),
            "bearingTempC": round(worst.get("bearing_temp_de_c") or 0, 1),
            "riskPct": risk,
            "loadTrend": [round(s["load_mw"]) for s in samples],
        }
    )

sched = q(
    """SELECT ts, SUM(scheduled_mw) AS sched, SUM(actual_mw) AS act
       FROM schedule_blocks WHERE ts > ? GROUP BY ts ORDER BY ts""",
    (now - 24 * 3600,),
)
generation24h = []
for r in sched:
    if r["ts"] % 3600 == 0:
        shortfall = max(0.0, (r["sched"] or 0) - (r["act"] or 0))
        generation24h.append(
            {
                "time": ist_hhmm(r["ts"]),
                "scheduledMw": round(r["sched"] or 0),
                "actualMw": round(r["act"] or 0),
                "shortfallMw": round(shortfall),
            }
        )

vib = q(
    """SELECT (ts + ?) / 86400 AS day, AVG(vibration_mm_s) AS vib, MIN(ts) AS ts0
       FROM condition_monitoring WHERE equip_id = ? AND ts > ?
       GROUP BY day ORDER BY day""",
    (IST_OFFSET, golden_equip, now - 35 * 86400),
)
vibration_trend = [
    {"date": ist_date(r["ts0"]), "vibMmS": round(r["vib"], 2)} for r in vib
]

prices = q(
    """SELECT ts, market, AVG(price_inr_mwh) AS p FROM market_prices
       WHERE ts > ? GROUP BY ts / 3600, market ORDER BY ts""",
    (now - 24 * 3600,),
)
price_by_hour = defaultdict(dict)
for r in prices:
    price_by_hour[ist_hhmm(r["ts"] - r["ts"] % 3600)][r["market"]] = round(r["p"] / 1000.0, 2)
market_prices_24h = [
    {"time": t, "damRs": v.get("DAM"), "rtmRs": v.get("RTM")}
    for t, v in sorted(price_by_hour.items())
]

expo = q(
    """SELECT SUBSTR(date, 1, 7) AS month,
              ROUND(SUM(capacity_charge_lost_inr) / 1e7, 2) AS ccLostCr,
              ROUND(SUM(MAX(dsm_charge_inr, 0)) / 1e7, 2) AS dsmCr,
              ROUND(SUM(rtm_replacement_cost_inr) / 1e7, 2) AS rtmCr,
              ROUND(SUM(net_exposure_inr) / 1e7, 2) AS netCr
       FROM commercial_exposure GROUP BY month ORDER BY month"""
)
MONTHS = {"01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
          "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"}
exposure_monthly = [
    {**r, "month": MONTHS[r["month"][5:7]]} for r in expo
]

exposure_by_unit = q(
    """SELECT unit_id AS unitId, cc_lost_cr AS ccLostCr, dsm_cr AS dsmCr,
              rtm_cr AS rtmCr, net_exposure_cr AS netCr
       FROM v_exposure_90d ORDER BY unit_id"""
)

golden_pred = next((p for p in preds if p["equip_id"] == golden_equip), preds[0] if preds else None)
spare = q(
    """SELECT si.part_id, si.name, si.on_hand_qty, si.lead_time_days,
              po.po_id, po.eta, po.status AS po_status
       FROM spares_inventory si
       LEFT JOIN purchase_orders po ON po.part_id = si.part_id AND po.status != 'received'
       WHERE si.part_id IN (SELECT part_id FROM equipment_spares WHERE equip_id = ?)
       ORDER BY si.is_critical DESC""",
    (golden_equip,),
)
spare_row = next((s for s in spare if s["on_hand_qty"] == 0), spare[0] if spare else None)

alerts = q("SELECT * FROM v_active_alerts")
alert_feed = []
for a in alerts:
    alert_feed.append(
        {
            "alertId": a["alert_id"],
            "unitId": a["unit_id"],
            "equipName": a["equip_name"],
            "severity": a["severity"],
            "category": a["category"],
            "title": a["title"],
            "message": a["message"],
            "rupeesAtRiskCr": round((a["rupees_at_risk"] or 0) / CRORE, 2) or None,
            "minutesAgo": max(1, (now - a["ts"]) // 60),
        }
    )

kpi_load = sum(u["loadMw"] for u in unit_feed)
kpi_declared = round(
    q("SELECT SUM(declared_capacity_mw) AS dc FROM commitments WHERE date = (SELECT MAX(date) FROM commitments)")[0]["dc"] or 0
)
paf = q("SELECT AVG(paf_pct) AS paf FROM performance_kpi WHERE date > date((SELECT MAX(date) FROM performance_kpi), '-90 day')")[0]["paf"]
net_expo_cr = round(sum(r["netCr"] or 0 for r in exposure_by_unit), 1)
fuel = q(
    """SELECT plant_id, days_of_coal FROM fuel_stock
       WHERE date = (SELECT MAX(date) FROM fuel_stock)"""
)
min_coal = min((r["days_of_coal"] for r in fuel), default=None)

feed = {
    "meta": {
        "operator": "NTPC",
        "clockNowEpoch": now,
        "plantCount": len({u["plant_id"] for u in units}),
        "unitCount": len(units),
        "installedMw": sum(u["capacity_mw"] for u in units),
        "goldenEquip": golden_equip,
        "goldenUnit": golden_unit,
        "vibAlert": VIB_ALERT,
        "vibDanger": VIB_DANGER,
    },
    "kpis": {
        "fleetLoadMw": kpi_load,
        "declaredMw": kpi_declared,
        "availabilityPct": round(paf, 1),
        "netExposure90dCr": net_expo_cr,
        "minCoalDays": round(min_coal, 1) if min_coal is not None else None,
    },
    "units": unit_feed,
    "generation24h": generation24h,
    "vibrationTrend": vibration_trend,
    "marketPrices24h": market_prices_24h,
    "exposureMonthly": exposure_monthly,
    "exposureByUnit": exposure_by_unit,
    "prediction": (
        {
            "equipId": golden_pred["equip_id"],
            "equipName": golden_pred["equip_name"],
            "tagNo": golden_pred["tag_no"],
            "unitId": golden_pred["unit_id"],
            "failureMode": golden_pred["failure_mode"],
            "rulDays": golden_pred["rul_days"],
            "confidencePct": golden_pred["confidence_pct"],
            "rupeesAtRiskCr": round(golden_pred["rupees_at_risk"] / CRORE, 2),
            "recommendedAction": golden_pred["recommended_action"],
            "predictedFailureDate": golden_pred["predicted_failure_date"],
        }
        if golden_pred
        else None
    ),
    "spare": (
        {
            "partId": spare_row["part_id"],
            "name": spare_row["name"],
            "onHandQty": spare_row["on_hand_qty"],
            "leadTimeDays": spare_row["lead_time_days"],
            "poId": spare_row["po_id"],
            "poEta": spare_row["eta"],
            "poStatus": spare_row["po_status"],
        }
        if spare_row
        else None
    ),
    "alerts": alert_feed,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(feed, f, indent=2, ensure_ascii=False)

print(f"feed.json written: {OUT}")
print(f"  units={len(unit_feed)} gen24h={len(generation24h)} vib={len(vibration_trend)} "
      f"prices={len(market_prices_24h)} months={len(exposure_monthly)} alerts={len(alert_feed)}")
if golden_pred:
    print(f"  golden: {golden_pred['tag_no']} RUL {golden_pred['rul_days']}d "
          f"risk {golden_pred['rupees_at_risk'] / CRORE:.2f} Cr")
conn.close()
