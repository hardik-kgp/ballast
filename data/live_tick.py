#!/usr/bin/env python3
"""
Ballast — live real-time simulator ("the twin is alive").

In production this is OPC-UA/MQTT from the DCS -> PI historian -> Ballast
ingestion. For the demo it replicates the EFFECT: every real interval it
advances the sim clock, appends fresh 1-min telemetry for all monitored tags
(so charts move on screen), and fires/escalates alerts as thresholds cross.

Scripted for the stage: BFP-2A vibration keeps climbing toward the ISO-10816
danger line (7.1 mm/s). When it crosses, Ballast raises a DANGER alert live.

Usage:
  python3 live_tick.py                 # 60 ticks, 2s apart, +1 sim-min/tick
  python3 live_tick.py --ticks 200 --interval 1 --step 120
  python3 live_tick.py --reset         # trim live-appended rows back to baseline
"""
import os, sys, time, argparse, sqlite3, math, random

HERE=os.path.dirname(os.path.abspath(__file__))
DB=os.path.join(HERE,"ballast.db")
CR=1e7
GEQ="VSTPS-U3-BFP-A"
VIB_DANGER=7.1

def connect():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL")
    return c

def meta(c,k):  return c.execute("SELECT value FROM data_meta WHERE key=?",(k,)).fetchone()[0]
def setmeta(c,k,v): c.execute("UPDATE data_meta SET value=? WHERE key=?",(str(v),k));

def reset(c):
    """Remove rows appended after the original history_end (the live tail)."""
    base=int(meta(c,"history_end"))
    n=c.execute("SELECT COUNT(*) FROM telemetry_1min WHERE ts>?",(base,)).fetchone()[0]
    c.execute("DELETE FROM telemetry_1min WHERE ts>?",(base,))
    c.execute("DELETE FROM condition_monitoring WHERE ts>?",(base,))
    c.execute("DELETE FROM unit_operating_state WHERE ts>?",(base,))
    c.execute("DELETE FROM alerts WHERE source='live_tick'")
    setmeta(c,"clock_now",base)
    c.commit()
    print(f"reset: removed {n:,} live 1-min rows; clock_now -> {base}")

def load_monitored(c):
    """monitored 'both' tags with their recent mean + last value for smooth continuation."""
    tags=c.execute("""SELECT p.tag_id,p.param_type,p.equip_id,p.unit_id,p.hi,p.hi_hi
                      FROM process_tags p WHERE p.tier='both'""").fetchall()
    out=[]
    for t in tags:
        row=c.execute("SELECT value FROM telemetry_1min WHERE tag_id=? ORDER BY ts DESC LIMIT 1",
                      (t["tag_id"],)).fetchone()
        mean=c.execute("SELECT AVG(value) a FROM telemetry_1min WHERE tag_id=? AND ts>=(SELECT MAX(ts)-86400 FROM telemetry_1min WHERE tag_id=?)",
                      (t["tag_id"],t["tag_id"])).fetchone()["a"]
        last=row["value"] if row else (mean or 0.0)
        out.append(dict(tag_id=t["tag_id"],p=t["param_type"],equip=t["equip_id"],unit=t["unit_id"],
                        last=last,mean=mean if mean is not None else last,
                        hi=t["hi"],hihi=t["hi_hi"]))
    return out

def next_value(tag, climb):
    """Smooth mean-reverting step; golden BFP-2A vibration keeps climbing."""
    p=tag["p"]; last=tag["last"]; mean=tag["mean"]
    if tag["equip"]==GEQ and p=="vibration":
        return last + climb + random.uniform(-0.02,0.05)      # accelerating
    if tag["equip"]==GEQ and p=="bearing_temp":
        return last + climb*5 + random.uniform(-0.1,0.2)
    # noise scaled by param magnitude, mean-reverting
    scale={"vibration":0.08,"bearing_temp":0.3,"winding_temp":0.4,"temperature":0.6,
           "pressure":0.4,"flow":3,"level":4,"current":2,"speed":0.6,"power":2.0,
           "vacuum":1.5,"frequency":0.02}.get(p,0.5)
    return last + 0.15*(mean-last) + random.gauss(0,scale)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--ticks",type=int,default=60)
    ap.add_argument("--interval",type=float,default=2.0,help="real seconds between ticks")
    ap.add_argument("--step",type=int,default=60,help="sim seconds advanced per tick")
    ap.add_argument("--climb",type=float,default=0.06,help="BFP-2A vib mm/s added per tick")
    ap.add_argument("--reset",action="store_true")
    a=ap.parse_args()

    c=connect()
    if a.reset:
        reset(c); return

    tz=int(meta(c,"tz_offset_seconds"))
    now=int(meta(c,"clock_now"))
    tags=load_monitored(c)
    danger_fired=c.execute("SELECT COUNT(*) FROM alerts WHERE source='live_tick' AND title LIKE '%DANGER%'").fetchone()[0]>0
    print(f"live_tick: {len(tags)} monitored tags | {a.ticks} ticks x {a.step}s | BFP-2A climb {a.climb} mm/s/tick\n")

    for k in range(a.ticks):
        now+=a.step
        rows=[]
        bfp_vib=None
        for t in tags:
            v=next_value(t,a.climb)
            t["last"]=v
            rows.append((t["tag_id"],now,round(v,3),192))
            if t["equip"]==GEQ and t["p"]=="vibration":
                bfp_vib=v
        c.executemany("INSERT OR REPLACE INTO telemetry_1min(tag_id,ts,value,quality) VALUES(?,?,?,?)",rows)

        # refresh golden condition_monitoring + health each tick
        if bfp_vib is not None:
            btemp=next((t["last"] for t in tags if t["equip"]==GEQ and t["p"]=="bearing_temp"),75)
            health=max(2,100-62*min((bfp_vib-2)/(7.1-2),1.3)-28*min(max((btemp-70)/35,0),1))
            c.execute("""INSERT OR REPLACE INTO condition_monitoring
                (equip_id,ts,vibration_mm_s,bearing_temp_de_c,health_index) VALUES(?,?,?,?,?)""",
                (GEQ,now,round(bfp_vib,3),round(btemp,2),round(health,1)))
            # escalate: DANGER crossing
            if bfp_vib>=VIB_DANGER and not danger_fired:
                risk=c.execute("SELECT rupees_at_risk FROM failure_predictions WHERE equip_id=?",(GEQ,)).fetchone()[0]
                c.execute("""INSERT INTO alerts(ts,unit_id,equip_id,severity,category,title,message,rupees_at_risk,status,source)
                    VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (now,"VSTPS-U3",GEQ,"critical","condition",
                     "BFP-2A entered ISO-10816 DANGER zone",
                     f"Vibration crossed {VIB_DANGER} mm/s live. Failure imminent — no standby, spare not in stock. Recommend immediate controlled derate of U3.",
                     risk,"active","live_tick"))
                danger_fired=True
                print(f"  🔴 DANGER alert fired @ vib={bfp_vib:.2f} mm/s")

        setmeta(c,"clock_now",now); c.commit()
        ist=time.strftime('%Y-%m-%d %H:%M',time.gmtime(now+tz))
        bar="#"*int(min(bfp_vib or 0,10));
        print(f"  tick {k+1:3d}/{a.ticks} | {ist} IST | BFP-2A vib {bfp_vib:5.2f} mm/s {bar}")
        time.sleep(a.interval)

    print("\nlive_tick done. (run with --reset to trim the live tail)")
    c.close()

if __name__=="__main__":
    main()
