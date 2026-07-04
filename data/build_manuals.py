#!/usr/bin/env python3
"""
Ballast — synthetic OEM manuals / O&M documents (RAW DATA artifacts).

Produces detailed, grounded PDF "manuals" into data/manuals/. These are the
unstructured counterpart to ballast.db: the "why / authority" that lives in
binders (normal vibration levels, service intervals, failure modes, RCA).

NOTE: Real OEM manuals (BHEL/KSB) and ISO 10816 are copyrighted and not
redistributable. These are SYNTHETIC documents whose numbers are grounded in
public standards (ISO 10816, CEA/CERC/CPCB) and kept consistent with the DB
(process_tags limits, failure_modes, service intervals). They are clearly
labelled synthetic. Chunking/retrieval is NOT done here — that's the
intelligence layer built on top.

Run:  python3 build_manuals.py
"""
import os
from fpdf import FPDF

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "manuals")
os.makedirs(OUT, exist_ok=True)

def s(t):
    return str(t).replace("₹", "Rs.").encode("latin-1", "replace").decode("latin-1")

class Manual(FPDF):
    doc_no = ""; title = ""
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "", 8); self.set_text_color(120)
        self.cell(0, 6, s(self.title), align="L")
        self.cell(0, 6, s(self.doc_no), align="R"); self.ln(8); self.set_text_color(0)
    def footer(self):
        self.set_y(-14); self.set_font("Helvetica", "I", 7); self.set_text_color(140)
        self.cell(0, 5, s("SYNTHETIC DOCUMENT - grounded in public standards (ISO 10816, CEA, CERC, CPCB). "
                          "For Ballast demo use; not an actual OEM manual."), align="C")
        self.ln(4); self.cell(0, 5, s(f"Page {self.page_no()}"), align="C"); self.set_text_color(0)

    def h1(self, t):
        self.ln(2); self.set_font("Helvetica", "B", 13); self.set_fill_color(20, 40, 70)
        self.set_text_color(255); self.cell(0, 8, s("  " + t), fill=True); self.ln(11); self.set_text_color(0)
    def h2(self, t):
        self.ln(1); self.set_font("Helvetica", "B", 11); self.set_text_color(20, 40, 70)
        self.cell(0, 7, s(t)); self.ln(8); self.set_text_color(0)
    def para(self, t):
        self.set_font("Helvetica", "", 10); self.multi_cell(0, 5, s(t)); self.ln(1)
    def bullets(self, items):
        self.set_font("Helvetica", "", 10)
        for it in items:
            self.set_x(self.l_margin + 4)
            self.multi_cell(self.epw - 4, 5, s("- " + it))
        self.ln(1)
    def table(self, headers, rows, widths=None):
        self.set_font("Helvetica", "B", 9)
        w = widths or [ (self.epw / len(headers)) ] * len(headers)
        self.set_fill_color(225, 232, 240)
        for i, hh in enumerate(headers):
            self.cell(w[i], 7, s(hh), border=1, fill=True, align="C")
        self.ln()
        self.set_font("Helvetica", "", 9)
        fill = False
        for r in rows:
            # measure height by wrapping first cell roughly; use fixed 6 for simplicity
            self.set_fill_color(245, 248, 251)
            for i, c in enumerate(r):
                self.cell(w[i], 6, s(c), border=1, fill=fill, align="L")
            self.ln(); fill = not fill
        self.ln(2)

def new(doc_no, title, subtitle, rev="Rev 3.1", oem="(synthetic OEM)"):
    m = Manual(); m.doc_no = doc_no; m.title = title
    m.set_auto_page_break(True, margin=18); m.add_page()
    m.set_font("Helvetica", "B", 20); m.ln(30); m.multi_cell(0, 10, s(title), align="C")
    m.set_font("Helvetica", "", 13); m.ln(2); m.multi_cell(0, 7, s(subtitle), align="C")
    m.ln(20); m.set_font("Helvetica", "", 10)
    m.table(["Field", "Value"],
            [["Document No.", doc_no], ["Revision", rev], ["Equipment OEM", oem],
             ["Applicable standard", "ISO 10816 / IEC / CEA norms"],
             ["Classification", "O&M reference - SYNTHETIC (Ballast demo)"],
             ["Owner", "Plant O&M / Reliability"]],
            widths=[60, 120])
    m.ln(4); m.set_font("Helvetica", "I", 9); m.set_text_color(120)
    m.multi_cell(0, 5, s("Disclaimer: This is a synthetic document generated for the Ballast demo. "
        "Values are grounded in public standards and typical industry practice but do not represent "
        "any specific OEM's proprietary manual."))
    m.set_text_color(0)
    return m

# ISO 10816 vibration severity zones (velocity RMS mm/s) — used across rotating-equipment docs
ISO_ZONES = [
    ["Zone A (new/good)", "<= 2.3", "<= 3.5", "Newly commissioned; ideal"],
    ["Zone B (acceptable)", "2.3 - 4.5", "3.5 - 7.1", "Unrestricted long-term operation"],
    ["Zone C (alarm)", "4.5 - 7.1", "7.1 - 11.0", "Short-term only; plan corrective action"],
    ["Zone D (danger)", "> 7.1", "> 11.0", "Risk of damage; trip / immediate action"],
]

docs = []

# ==========================================================================
# 1. BOILER FEED PUMP — O&M MANUAL  (the golden-scenario manual)
# ==========================================================================
m = new("BFP-OM-4471", "Boiler Feed Pump - Operation & Maintenance Manual",
        "Barrel-type multistage centrifugal BFP, 50% MCR, motor-driven", oem="(synthetic; KSB/BHEL class)")
m.add_page()
m.h1("1. Equipment Overview")
m.para("The Boiler Feed Pump (BFP) delivers feedwater from the deaerator to the boiler drum against "
       "full boiler pressure. Units are configured 3x50% (two running, one standby). Loss of a running "
       "BFP without an available standby forces a unit derating; sustained loss forces a unit trip. "
       "BFP is therefore a Criticality 'A' asset.")
m.table(["Parameter", "Rating"],
        [["Type", "Barrel (double casing) multistage centrifugal"],
         ["Capacity", "50% MCR (~ 620 t/h at 500 MW)"],
         ["Rated head", "~ 2050 m (approx 200 bar discharge)"],
         ["Drive", "HT motor, ~ 9,500 kW"],
         ["Speed", "~ 5,200 rpm via hydraulic coupling"],
         ["Bearings", "DE tilting-pad thrust + journal; NDE journal"],
         ["Lube oil", "ISO VG 46 turbine oil, forced lubrication"]],
        widths=[70, 110])

m.h1("2. Vibration Limits (ISO 10816-3, large machines, flexible support)")
m.para("Overall velocity RMS measured at bearing housings (DE/NDE, horizontal + vertical). "
       "The alarm and trip philosophy below is applied in the DCS/CBM system.")
m.table(["Zone", "Vel. RMS (support-A)", "Vel. RMS (support-B)", "Action"], ISO_ZONES,
        widths=[45, 45, 45, 45])
m.h2("Applied set-points for this BFP")
m.table(["Set-point", "Value", "Response"],
        [["ALERT (Zone C entry)", "4.5 mm/s", "Raise CBM alert; increase monitoring; plan action"],
         ["DANGER (Zone D entry)", "7.1 mm/s", "Prepare controlled derate; ready standby"],
         ["TRIP (sustained)", "> 7.1 mm/s for > 10 min", "Trip pump; transfer to standby"]],
        widths=[60, 40, 80])
m.para("Interpretation note: a rising trend from Zone B into Zone C is more significant than an "
       "absolute reading. A DE-bearing vibration climbing over days typically indicates thrust-bearing "
       "wear or shaft misalignment (see Section 5).")

m.h1("3. Bearing Temperature Limits")
m.table(["Point", "Normal", "Alarm", "Trip"],
        [["DE thrust bearing metal temp", "65 - 85 degC", "95 degC", "105 degC"],
         ["NDE journal bearing metal temp", "60 - 80 degC", "90 degC", "100 degC"],
         ["Lube oil supply temp", "38 - 45 degC", "50 degC", "55 degC"]],
        widths=[75, 35, 35, 35])

m.h1("4. Preventive Maintenance & Service Intervals")
m.table(["Task", "Interval", "Notes"],
        [["Lube oil sampling (ISO 4406)", "Monthly", "Trend particle count; target <= 18/16/13"],
         ["Vibration route survey", "Weekly", "Handheld backup to online CBM"],
         ["DE thrust bearing inspection/replace", "8,000 running hrs", "Or on vibration/temp trend breach"],
         ["Mechanical seal replacement", "16,000 running hrs", "Or on seal leak-off rise"],
         ["Coupling alignment check", "Annual / after overhaul", "Laser alignment"],
         ["Full overhaul", "48,000 running hrs", "Rotor, bearings, seals, clearances"]],
        widths=[70, 45, 65])
m.para("MTBF (design): 30,000 - 45,000 hours. Critical insurance spare: DE thrust bearing assembly "
       "(long procurement lead time - keep on stock).")

m.h1("5. Common Failure Modes (ISO 14224) & Root Cause")
m.table(["Failure mode", "Mechanism", "Early indicator", "Typical MTTR"],
        [["Bearing failure", "Fatigue / lube contamination", "Rising DE vibration + bearing temp", "72 h"],
         ["Vibration high", "Misalignment / imbalance", "1x/2x running-speed vib rise", "48 h"],
         ["Seal leakage", "Wear / dry-run", "Seal leak-off flow rise", "24 h"],
         ["Cavitation", "Low suction / NPSH", "Broadband noise, flow instability", "Variable"]],
        widths=[42, 52, 56, 30])
m.para("Bearing-failure playbook: when DE vibration trends from Zone B toward Zone C/D over several "
       "days with a coincident bearing-temperature rise, the thrust bearing is the prime suspect. "
       "Confirm with oil-particle trend. If no healthy standby is available and the critical bearing "
       "spare is not in stock, pre-emptively derate the unit to protect the grid commitment rather "
       "than risk an uncontrolled trip.")
docs.append((m, "BFP-OM-Manual.pdf"))

# ==========================================================================
# 2. COAL MILL / PULVERIZER — O&M MANUAL
# ==========================================================================
m = new("MILL-OM-2210", "Coal Mill (Bowl Mill) - Operation & Maintenance Manual",
        "Vertical bowl-type pulverizer; 6 mills per 500 MW unit (5+1)", oem="(synthetic; BHEL class)")
m.add_page()
m.h1("1. Overview")
m.para("Bowl mills pulverize raw coal to the fineness required for stable combustion. A 500 MW unit "
       "runs six mills in a 5+1 configuration; loss of one mill typically forces a partial derating "
       "(Criticality 'B'). Mill availability and fineness directly affect boiler efficiency and NOx.")
m.h1("2. Vibration & Temperature Limits")
m.table(["Zone", "Vel. RMS (support-A)", "Vel. RMS (support-B)", "Action"], ISO_ZONES,
        widths=[45, 45, 45, 45])
m.table(["Point", "Normal", "Alarm", "Trip"],
        [["Gearbox/pinion vibration", "Zone A/B", "4.5 mm/s", "7.1 mm/s"],
         ["Mill outlet temp (PA)", "70 - 90 degC", "95 degC", "105 degC"],
         ["Mill motor bearing temp", "55 - 75 degC", "90 degC", "100 degC"]],
        widths=[75, 35, 35, 35])
m.h1("3. Service Intervals")
m.table(["Task", "Interval"],
        [["Grinding roll / bull-ring inspection", "4,000 running hrs"],
         ["Roll & liner replacement", "On wear (typ. 12,000-18,000 hrs)"],
         ["Gearbox oil change", "8,000 hrs"],
         ["Mill motor bearing regreasing", "2,000 hrs"],
         ["Classifier / seal air check", "Quarterly"]],
        widths=[110, 70])
m.h1("4. Failure Modes")
m.bullets(["Roller wear (erosion) - falling fineness, rising mill DP and vibration.",
           "Gearbox bearing wear (fatigue) - rising vibration at gear-mesh frequency.",
           "Choke / blockage - sudden mill DP rise; risk of mill trip.",
           "Hot primary air excursion - fire/deflagration risk; obey outlet-temp trip."])
docs.append((m, "CoalMill-OM-Manual.pdf"))

# ==========================================================================
# 3. FANS (ID/FD/PA) — O&M MANUAL
# ==========================================================================
m = new("FAN-OM-3050", "Draft Fans (ID / FD / PA) - O&M Manual",
        "Axial/centrifugal draft fans; 2x50% per service", oem="(synthetic; BHEL class)")
m.add_page()
m.h1("1. Overview")
m.para("Induced-draft (ID), forced-draft (FD) and primary-air (PA) fans establish furnace draft and "
       "combustion/transport air. Configured 2x50%; loss of one fan derates the unit (Criticality 'A' "
       "for ID/FD/PA).")
m.h1("2. Vibration Limits (ISO 10816)")
m.table(["Zone", "Vel. RMS (support-A)", "Vel. RMS (support-B)", "Action"], ISO_ZONES,
        widths=[45, 45, 45, 45])
m.table(["Point", "Normal", "Alarm", "Trip"],
        [["Fan bearing vibration", "Zone A/B", "4.5 mm/s", "7.1 mm/s"],
         ["Bearing metal temp", "50 - 75 degC", "90 degC", "100 degC"]],
        widths=[75, 35, 35, 35])
m.h1("3. Service Intervals & Failure Modes")
m.table(["Task", "Interval"],
        [["Bearing regreasing", "2,000 hrs"],
         ["Bearing replacement", "On trend / 20,000 hrs"],
         ["Impeller erosion inspection (ID)", "Annual"],
         ["Blade-pitch actuator check", "Quarterly"]],
        widths=[110, 70])
m.bullets(["Imbalance (ash deposit on ID impeller) - 1x vibration rise; clean/rebalance.",
           "Bearing fatigue - broadband + bearing-frequency vibration; replace.",
           "Duct/damper issues - flow instability, draft loss."])
docs.append((m, "Fan-OM-Manual.pdf"))

# ==========================================================================
# 4. TURBINE-GENERATOR — O&M MANUAL
# ==========================================================================
m = new("TG-OM-1100", "Steam Turbine-Generator - O&M Manual",
        "3-cylinder (HP/IP/LP) reheat turbine + 2-pole generator", oem="(synthetic; BHEL/Siemens class)")
m.add_page()
m.h1("1. Vibration (ISO 10816-2, large turbine-generator sets)")
m.para("For large turbo sets, both bearing-housing velocity and relative shaft vibration (proximity "
       "probes, displacement in micrometres) are monitored. Bearing-housing guide values below.")
m.table(["Condition", "Shaft vib (um, pk-pk)", "Bearing housing (mm/s)", "Action"],
        [["Good", "< 90", "< 2.8", "Normal"],
         ["Acceptable", "90 - 165", "2.8 - 5.3", "Unrestricted"],
         ["Alarm", "165 - 240", "5.3 - 8.5", "Investigate"],
         ["Danger/Trip", "> 240", "> 8.5", "Trip protection"]],
        widths=[38, 48, 52, 42])
m.h1("2. Key Process Limits")
m.table(["Point", "Normal", "Alarm", "Trip"],
        [["Main steam temp", "537 degC", "566 degC", "571 degC"],
         ["HP/IP metal temp (rotor)", "<= 540 degC", "566 degC", "571 degC"],
         ["Thrust bearing metal temp", "70 - 100 degC", "110 degC", "120 degC"],
         ["Lube oil pressure", "9 - 10 bar", "7 bar (low)", "5 bar (trip)"],
         ["Overspeed", "3000 rpm", "-", "3300 rpm"],
         ["Condenser vacuum", "660 - 700 mmHg", "600 (low)", "550 (trip)"]],
        widths=[65, 40, 40, 40])
m.h1("3. Service Intervals & Failure Modes")
m.table(["Task", "Interval"],
        [["Lube oil analysis", "Monthly"],
         ["Bearing inspection", "Major overhaul (~ 4 yrs)"],
         ["Governor/valve testing", "Quarterly"],
         ["Overspeed trip test", "Post-overhaul / annual"]],
        widths=[110, 70])
m.bullets(["High vibration - imbalance, rub, misalignment, bearing wipe (lube failure).",
           "Rising thrust-bearing temp - thrust wear; risk of axial contact.",
           "Falling condenser vacuum - air ingress / CW fouling; derates output."])
docs.append((m, "TurbineGenerator-OM-Manual.pdf"))

# ==========================================================================
# 5. CONDITION MONITORING / VIBRATION SOP
# ==========================================================================
m = new("SOP-CBM-0007", "Condition-Based Maintenance & Vibration Monitoring SOP",
        "Plant standard operating procedure for online CBM")
m.add_page()
m.h1("1. Purpose & Scope")
m.para("Defines vibration/temperature monitoring, alarm philosophy and the escalation workflow for "
       "rotating equipment (mills, fans, BFPs, CW/CE pumps, turbine-generator). Aligns with ISO 10816 "
       "severity zones and the plant's predictive-maintenance strategy.")
m.h1("2. ISO 10816 Severity Zones (velocity RMS, mm/s)")
m.table(["Zone", "Support A (rigid)", "Support B (flexible)", "Meaning"], ISO_ZONES,
        widths=[42, 46, 46, 46])
m.h1("3. Measurement & Alarm Philosophy")
m.bullets(["Measure at each bearing housing in H, V, A directions; trend overall RMS + spectra.",
           "ALERT at Zone C entry (typ. 4.5 mm/s): raise CBM notification, tighten monitoring.",
           "DANGER at Zone D entry (typ. 7.1 mm/s): ready standby, prepare controlled derate.",
           "TRIP on sustained Zone D per equipment set-point.",
           "Trend matters more than absolute value: a rising slope over days warrants action even "
           "within Zone B."])
m.h1("4. Escalation Workflow")
m.table(["Step", "Trigger", "Action", "Owner"],
        [["1", "Zone C entry", "Auto CBM alert + predictive WO raised", "CBM system"],
         ["2", "Trend confirmed", "Diagnose (spectra, oil analysis)", "Reliability engineer"],
         ["3", "No healthy standby / spare", "Assess commercial risk; plan derate", "Shift + Commercial"],
         ["4", "Zone D / imminent", "Controlled derate or transfer; execute WO", "Shift charge engineer"]],
        widths=[15, 45, 80, 45])
m.para("Commercial linkage: before any forced trip, evaluate PAF headroom vs NAPAF and DSM exposure. "
       "A pre-emptive controlled derate is preferred to an uncontrolled trip (see ABT primer).")
docs.append((m, "CBM-Vibration-SOP.pdf"))

# ==========================================================================
# 6. RCA — BOILER TUBE LEAK
# ==========================================================================
m = new("RCA-BTL-0912", "Root Cause Analysis Playbook - Boiler Tube Leak",
        "The single largest cause of forced outages in Indian coal units")
m.add_page()
m.h1("1. Why it matters")
m.para("Boiler tube leaks (BTL) are the leading contributor to forced outages and lost availability "
       "in coal-fired units. Early detection and disciplined RCA materially improve EAF/EFOR.")
m.h1("2. Mechanisms (by location)")
m.table(["Mechanism", "Typical location", "Driver"],
        [["Fireside erosion", "Economizer, LTSH", "Fly-ash velocity, high ash coal"],
         ["Overheating / creep", "SH/RH platens", "Steam-side deposits, low flow"],
         ["Corrosion fatigue", "Waterwall", "Water chemistry, cyclic stress"],
         ["Soot-blower erosion", "Near soot blowers", "Misaligned/steam-wet blowing"],
         ["Hydrogen damage", "Waterwall", "Under-deposit acidic corrosion"]],
        widths=[45, 60, 75])
m.h1("3. Early Indicators")
m.bullets(["Rising furnace/tube-leak acoustic monitor readings.",
           "Make-up water / DM consumption increase.",
           "Unaccounted drop in boiler efficiency; flue-gas moisture rise.",
           "Local temperature anomalies on metal thermocouples."])
m.h1("4. Prevention & Response")
m.bullets(["Maintain water/steam chemistry within limits; monitor deposits.",
           "Coal quality control (ash, abrasives); manage fly-ash velocity.",
           "Soot-blower alignment and steam-quality checks.",
           "On confirmed leak: plan controlled shutdown; isolate; pad-repair or tube replacement "
           "(typical MTTR 5 days)."])
docs.append((m, "RCA-BoilerTubeLeak.pdf"))

# ==========================================================================
# 7. MASTER MAINTENANCE SCHEDULE
# ==========================================================================
m = new("MSCH-MASTER-0001", "Master Preventive Maintenance Schedule",
        "Consolidated service intervals across critical rotating equipment")
m.add_page()
m.h1("Service Intervals (running hours unless noted)")
m.table(["Equipment", "Key PM task", "Interval", "Critical spare"],
        [["Boiler Feed Pump", "DE thrust bearing", "8,000 h", "Thrust bearing (long lead)"],
         ["Boiler Feed Pump", "Mechanical seal", "16,000 h", "Seal cartridge"],
         ["Boiler Feed Pump", "Full overhaul", "48,000 h", "Rotor kit"],
         ["Coal Mill", "Roll/liner", "12,000-18,000 h", "Grinding roll"],
         ["Coal Mill", "Gearbox oil", "8,000 h", "-"],
         ["ID/FD/PA Fan", "Bearing", "20,000 h", "Fan bearing"],
         ["CW Pump", "Impeller inspection", "Annual", "Impeller"],
         ["Turbine-Generator", "Major overhaul", "~ 4 years", "Journal bearing"],
         ["Generator", "RTD / winding check", "Annual", "RTD set"]],
        widths=[45, 55, 40, 45])
m.para("Note: interval-based PM is superseded by condition-based action when CBM trends breach ISO "
       "10816 alarm zones (see SOP-CBM-0007). This is the core of the predictive strategy.")
docs.append((m, "MaintenanceSchedule-Master.pdf"))

# --- write all ---
print("Writing manuals ->", OUT)
total = 0
for m, fn in docs:
    path = os.path.join(OUT, fn)
    m.output(path); sz = os.path.getsize(path); total += sz
    print(f"  {fn:34s} {m.page_no():>2d} pages  {sz/1024:6.1f} KB")
print(f"\n  {len(docs)} manuals, {total/1024:.0f} KB total, in data/manuals/")
