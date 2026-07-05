// Records the ~60-second product demo against the running dev server, in HD.
// Captures raw JPEG frames via the Chrome DevTools screencast (quality 92,
// native 1920x1080) and encodes them with Playwright's bundled ffmpeg at a
// high bitrate; the built-in Playwright recorder is capped at a low bitrate.
// Usage: node scripts/record_demo.mjs   (needs app on :5177 and query service on :8077)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "..", "demo");
const FRAMES_DIR = join(OUT_DIR, "capture");
const APP_URL = "http://localhost:5177";
const SIZE = { width: 1920, height: 1080 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms, spread = 0.25) => ms + (Math.random() * 2 - 1) * ms * spread;

// Eased, slightly curved mouse travel so movement reads as human.
let cur = { x: SIZE.width / 2, y: SIZE.height / 2 };
async function moveTo(page, x, y, ms = 550) {
  const steps = Math.max(12, Math.round(ms / 16));
  const from = { ...cur };
  const arc = (Math.random() * 2 - 1) * Math.min(60, Math.hypot(x - from.x, y - from.y) * 0.15);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    const nx = from.x + (x - from.x) * e + Math.sin(Math.PI * t) * arc * 0.3;
    const ny = from.y + (y - from.y) * e + Math.sin(Math.PI * t) * arc;
    await page.mouse.move(nx, ny);
    await sleep(ms / steps);
  }
  cur = { x, y };
}

async function moveToEl(page, locator, ms = 550, dx = 0, dy = 0) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element not visible for cursor move");
  await moveTo(page, box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, ms);
  return box;
}

async function humanClick(page, locator, ms = 550) {
  await moveToEl(page, locator, ms);
  await sleep(jitter(140));
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
}

async function humanType(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(jitter(ch === " " ? 70 : 45, 0.6));
  }
}

const CURSOR_SCRIPT = `
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.id = "__demo_cursor";
    dot.style.cssText = [
      "position:fixed", "z-index:2147483647", "width:20px", "height:20px",
      "border-radius:50%", "background:rgba(37,99,235,0.28)",
      "border:2px solid rgba(37,99,235,0.85)", "pointer-events:none",
      "transform:translate(-50%,-50%)", "left:${SIZE.width / 2}px", "top:${SIZE.height / 2}px",
      "box-shadow:0 1px 6px rgba(16,24,40,0.35)", "transition:width .12s,height .12s"
    ].join(";");
    document.body.appendChild(dot);
    window.addEventListener("mousemove", (e) => {
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    }, true);
    window.addEventListener("mousedown", () => { dot.style.width = "14px"; dot.style.height = "14px"; }, true);
    window.addEventListener("mouseup", () => { dot.style.width = "20px"; dot.style.height = "20px"; }, true);
  });
`;

function findFfmpeg() {
  const roots = [
    join(process.env.LOCALAPPDATA ?? "", "Temp", "cursor-sandbox-cache"),
    join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
  ];
  for (const root of roots) {
    try {
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, entry.name);
          if (entry.isDirectory()) stack.push(p);
          else if (entry.name === "ffmpeg-win64.exe") return p;
        }
      }
    } catch {
      /* root missing, try next */
    }
  }
  throw new Error("bundled ffmpeg not found; run npx playwright install");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[page console.error]", msg.text().slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/")) console.log("[request failed]", req.url(), req.failure()?.errorText);
  });
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400)
      console.log("[api error]", res.status(), res.url());
  });

  // High-quality capture: raw JPEG frames straight from the compositor.
  const cdp = await context.newCDPSession(page);
  const frames = []; // { file, ts }
  let frameNo = 0;
  cdp.on("Page.screencastFrame", (ev) => {
    const file = join(FRAMES_DIR, `f${String(frameNo++).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(ev.data, "base64"));
    frames.push({ file, ts: ev.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: SIZE.width,
    maxHeight: SIZE.height,
    everyNthFrame: 1,
  });

  // Scene 1: land on the Assistant hero exchange (artifact-bearing answer).
  await sleep(400);
  await moveTo(page, 840, 380, 600);
  await sleep(1400);

  // Scene 2: Dashboard, alive.
  await humanClick(page, page.getByRole("button", { name: "Dashboard" }), 550);
  await sleep(900);
  await moveTo(page, 740, 240, 650); // drift across KPI row
  await sleep(500);
  await moveTo(page, 1380, 245, 550);
  await sleep(600);

  // Scene 3: the incident. Scroll the vibration card into view first.
  const simulate = page.getByRole("button", { name: "Simulate live" });
  await simulate.scrollIntoViewIfNeeded();
  await sleep(400);
  await humanClick(page, simulate, 550);
  // Watch the climb until the danger banner arms the Respond button (~4s).
  await moveTo(page, 1320, 740, 800);
  const respond = page.getByRole("button", { name: "Respond" });
  await respond.waitFor({ state: "visible", timeout: 15000 });
  await sleep(1000); // let the DANGER banner register with the viewer
  await humanClick(page, respond, 550);

  // Scene 4: mitigation dialog, compare and apply.
  const apply = page.getByRole("button", { name: "Apply controlled mitigation" });
  await apply.waitFor({ state: "visible", timeout: 5000 });
  await sleep(300);
  await moveTo(page, 800, 480, 500); // glance: run-to-fail
  await sleep(600);
  await moveTo(page, 1200, 480, 450); // glance: mitigation
  await sleep(700);
  await humanClick(page, apply, 500);
  await sleep(1500); // applied state: 4 actions drafted
  await humanClick(page, page.getByRole("button", { name: "Done" }), 400);
  await sleep(200);

  // Scene 5: Maintenance, why we knew + SOP.
  await humanClick(page, page.getByRole("button", { name: "Maintenance" }), 500);
  await sleep(1000);
  const sop = page.getByRole("link", { name: /BFP O&M Manual/ }).first();
  await moveToEl(page, sop, 600);
  await sleep(800);
  await page.mouse.wheel(0, 480); // glance at the health-sorted register
  await sleep(1100);

  // Scene 6: the golden query, streamed live.
  await humanClick(page, page.getByRole("button", { name: "Assistant" }), 500);
  await sleep(600);
  const input = page.locator("#chat-input");
  await humanClick(page, input, 500);
  await humanType(page, "Where has the money leaked over the last 90 days?");
  await sleep(250);
  await page.keyboard.press("Enter");

  // Artifact card appears when rows land; prose streams after.
  const artifactButtons = page.getByRole("button", { name: "Open details panel" });
  const before = await artifactButtons.count();
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll('[aria-label="Open details panel"]').length > n,
      before,
      { timeout: 45000 }
    );
  } catch (err) {
    await page.screenshot({ path: join(OUT_DIR, "debug-fail.png") });
    const state = await page.evaluate(() => ({
      buttons: document.querySelectorAll('[aria-label="Open details panel"]').length,
      draft: document.querySelector("#chat-input")?.value,
      sendDisabled: document.querySelector('[aria-label="Send message"]')?.hasAttribute("disabled"),
      lastMsg: [...document.querySelectorAll("p")].slice(-6).map((p) => p.textContent?.slice(0, 80)),
    }));
    console.log("DEBUG STATE:", JSON.stringify(state, null, 1));
    throw err;
  }
  // The token burst finishes within ~1s of the rows event; give it a beat so
  // the auto-scroll settles before we interact with the artifact.
  await sleep(2800);

  // Scene 7: dwell on the chat artifact itself, then open its details panel.
  const artifactCard = page
    .locator("section", { has: page.getByRole("button", { name: "Open details panel" }) })
    .last();
  await artifactCard.scrollIntoViewIfNeeded();
  await sleep(300);
  await moveToEl(page, artifactCard, 650, -80, -20); // hover the chart area
  await sleep(1100);
  await moveToEl(page, artifactCard, 450, 60, 40); // glide over the result table
  await sleep(800);
  const detailsBtn = artifactButtons.last();
  await humanClick(page, detailsBtn, 500);
  await sleep(1300);
  const barBtn = page.getByRole("button", { name: "bar", exact: true });
  if (await barBtn.count()) {
    await humanClick(page, barBtn.first(), 450);
    await sleep(900);
  }
  const labelsBtn = page.getByRole("button", { name: "Toggle value labels" });
  if (await labelsBtn.count()) {
    await humanClick(page, labelsBtn.first(), 450);
    await sleep(1000);
  }
  await moveTo(page, 1560, 620, 500);
  await sleep(1500);

  await cdp.send("Page.stopScreencast").catch(() => {});
  await sleep(300);
  await context.close();
  await browser.close();

  // Encode: variable-frame-duration concat -> VP8 at a high bitrate.
  if (frames.length < 2) throw new Error("no frames captured");
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1 ? Math.max(0.01, frames[i + 1].ts - frames[i].ts) : 0.8;
    lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`);
    lines.push(`duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
  const listFile = join(FRAMES_DIR, "list.txt");
  writeFileSync(listFile, lines.join("\n"));

  const ffmpeg = findFfmpeg();
  const target = join(OUT_DIR, "ntpc-demo-60s-hd.webm");
  rmSync(target, { force: true });
  execFileSync(
    ffmpeg,
    [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libvpx", "-b:v", "10M", "-qmin", "3", "-qmax", "24",
      "-deadline", "good", "-cpu-used", "2", "-threads", "8",
      "-pix_fmt", "yuv420p", "-vf", "fps=30,scale=1920:1080:flags=lanczos",
      target,
    ],
    { stdio: "inherit" }
  );
  const seconds = frames[frames.length - 1].ts - frames[0].ts;
  console.log(`frames: ${frames.length} over ${seconds.toFixed(1)}s`);
  console.log("saved:", target);
  rmSync(FRAMES_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
