#!/usr/bin/env node
/**
 * AR preview harness: drives the camera steps with photos from the YOLO
 * training dataset instead of a live camera, so the real model runs through
 * the real UI and the overlay can be checked at phone, landscape and tablet
 * sizes without walking around a router.
 *
 * getUserMedia is replaced with a canvas stream that paints whichever
 * fixture image the script is currently showing. Every screenshot also
 * records overlay geometry (is the callout on screen, does it cover the
 * connector it points at, is it hidden under the bottom sheet) so scaling
 * regressions show up as numbers, not only as pictures.
 *
 *   npm run dev                       # in another shell
 *   npm run ar:preview                # all scenarios
 *   npm run ar:preview -- --only gallery --viewports phone
 *
 * Output: ar-preview/ (screenshots, report.json, index.html, sheet-*.png)
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "tests/fixtures/whitemodem");
const args = parseArgs(process.argv.slice(2));
const BASE = args.base ?? "http://localhost:3000";
const OUT = path.resolve(args.out ?? path.join(ROOT, "ar-preview"));
const ONLY = new Set((args.only ?? "pages,router,install,gallery,locate").split(","));

/** cam = [width, height] of the fake camera; phones deliver portrait frames when held upright. */
const VIEWPORTS = {
  phone: { width: 390, height: 844, cam: [480, 640] },
  android: { width: 360, height: 760, cam: [480, 640] },
  landscape: { width: 844, height: 390, cam: [640, 480] },
  tablet: { width: 820, height: 1180, cam: [480, 640] },
};
const FLOW_VIEWPORTS = (args.viewports ?? "phone,android,landscape,tablet").split(",");
const GALLERY_VIEWPORT = FLOW_VIEWPORTS[0];

const CLASS_NAMES = ["lan", "modem", "off", "on", "onbutton", "orange", "pow", "powcab", "sim", "siminside", "simopen"];
const TARGET = "[data-ar-target], .camera-highlight";
const SESSION_KEY = "fwa-install-session";
const XIAOMI = { routerId: "xiaomi-cb0401v2", consentGranted: true };

const report = [];

// ---------------------------------------------------------------- fixtures

async function loadFixtures() {
  const out = [];
  for (const split of ["test", "valid"]) {
    const dir = path.join(FIXTURES, split, "images");
    for (const file of (await fs.readdir(dir)).sort()) {
      const label = path.join(FIXTURES, split, "labels", file.replace(/\.jpg$/, ".txt"));
      const counts = {};
      for (const line of (await fs.readFile(label, "utf8")).split("\n")) {
        const id = Number(line.trim().split(/\s+/)[0]);
        if (!line.trim() || Number.isNaN(id)) continue;
        counts[CLASS_NAMES[id]] = (counts[CLASS_NAMES[id]] ?? 0) + 1;
      }
      out.push({ rel: `${split}/images/${file}`, short: shortName(file), counts });
    }
  }
  return out;
}

function shortName(file) {
  return file.replace(/_jpe?g\.rf\..*$/, "").replace(/^WhatsApp-Image-2025-04-22-at-/, "WA-");
}

const has = (f, ...classes) => classes.some((c) => (f.counts[c] ?? 0) > 0);

// ---------------------------------------------------------------- browser

/** Runs in the page before any app code. */
function fakeCameraInit({ w, h, session, key }) {
  if (session && !sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, JSON.stringify({ state: session, version: 0 }));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  let img = null;
  const draw = () => {
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, w, h);
    // Dataset photos were stretched to 640x640; stretching back to the
    // camera's aspect restores the original framing, and the model's own
    // 640x640 resize then sees exactly the dataset image again.
    if (img) ctx.drawImage(img, 0, 0, w, h);
  };
  setInterval(draw, 66);
  window.__fakeCam = {
    async show(url) {
      if (!url) {
        img = null;
      } else {
        const next = new Image();
        next.src = url;
        await next.decode();
        img = next;
      }
      draw();
    },
  };
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
  }
}

async function openPage(browser, vpName, { session = XIAOMI } = {}) {
  const vp = VIEWPORTS[vpName];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/__fixtures/**", (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__fixtures\//, ""));
    return route.fulfill({ path: path.join(FIXTURES, rel), contentType: "image/jpeg" });
  });
  await context.addInitScript(fakeCameraInit, { w: vp.cam[0], h: vp.cam[1], session, key: SESSION_KEY });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
  return { context, page };
}

async function show(page, fixture) {
  await page.evaluate((u) => window.__fakeCam.show(u), fixture ? `/__fixtures/${fixture.rel}` : null);
}

/** Show a blank frame until the previous image's overlay is gone, so no screenshot catches a stale detection. */
async function clear(page) {
  await show(page, null);
  await page
    .waitForFunction((sel) => !document.querySelector(sel), TARGET, { timeout: 8000 })
    .catch(() => {});
}

async function settle(page, expectTarget = true) {
  if (expectTarget) {
    await page.locator(TARGET).first().waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
  }
  // reticle easing + callout entrance animation
  await page.waitForTimeout(900);
}

async function waitForCamera(page) {
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return !!v && !!v.srcObject && v.readyState >= 3;
    },
    null,
    { timeout: 90000 }
  );
  // first inference on SwiftShader includes shader compilation
  await page.waitForTimeout(1500);
}

function nextButton(page) {
  return page.getByRole("button", { name: /^(Další|Dokončit instalaci)$/ }).first();
}

async function waitEnabled(locator, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await locator.isEnabled().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Feed candidate images until the step's gate opens. */
async function passStep(page, candidates, label) {
  for (const f of candidates) {
    await clear(page);
    await show(page, f);
    if (await waitEnabled(nextButton(page))) return f;
  }
  throw new Error(`could not pass step "${label}" with ${candidates.length} candidate images`);
}

// ---------------------------------------------------------------- measuring

async function measure(page) {
  return page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const inter = (a, b) => {
      if (!a || !b) return 0;
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h : 0;
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const target = rect("[data-ar-target]");
    const callout = rect("[data-ar-callout]");
    const sheet = rect("[data-ar-sheet]");
    const topbar = rect("[data-ar-topbar]");
    const video = rect("video");
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      viewport: [vw, vh],
      // the camera runs from the top edge down to (just under) the sheet
      videoFillsCamera: !!video && video.y <= 0.5 && (!sheet || Math.abs(video.y + video.h - sheet.y) <= 30 || Math.abs(video.x + video.w - sheet.x) <= 30),
      targets: document.querySelectorAll("[data-ar-target]").length,
      target,
      callout,
      calloutInView: callout
        ? callout.x >= -0.5 && callout.y >= -0.5 && callout.x + callout.w <= vw + 0.5 && callout.y + callout.h <= vh + 0.5
        : null,
      calloutCoversTarget: callout && target ? r2(inter(callout, target) / (target.w * target.h)) : null,
      calloutUnderSheet: callout && sheet ? r2(inter(callout, sheet) / (callout.w * callout.h)) : null,
      calloutUnderTopbar: callout && topbar ? r2(inter(callout, topbar) / (callout.w * callout.h)) : null,
      targetUnderSheet: target && sheet ? r2(inter(target, sheet) / (target.w * target.h)) : null,
    };
  });
}

async function shoot(page, scenario, name, meta = {}) {
  const dir = path.join(OUT, scenario);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  const geometry = await measure(page);
  const entry = { scenario, name, file: path.relative(OUT, file), ...meta, geometry };
  report.push(entry);
  const flags = issues(geometry);
  console.log(`  ${scenario}/${name}${flags.length ? `  ⚠ ${flags.join(", ")}` : ""}`);
  return entry;
}

function issues(g) {
  const out = [];
  if (g.callout && !g.calloutInView) out.push("callout off-screen");
  if ((g.calloutCoversTarget ?? 0) > 0.25) out.push(`callout covers ${Math.round(g.calloutCoversTarget * 100)}% of target`);
  if ((g.calloutUnderSheet ?? 0) > 0.05) out.push(`callout ${Math.round(g.calloutUnderSheet * 100)}% under sheet`);
  if ((g.calloutUnderTopbar ?? 0) > 0.05) out.push(`callout ${Math.round(g.calloutUnderTopbar * 100)}% under top bar`);
  return out;
}

// ---------------------------------------------------------------- scenarios

async function scenarioPages(browser, vpName) {
  const { context, page } = await openPage(browser, vpName, {
    session: { ...XIAOMI, placeRating: "doporucene", bestMbps: 84.2, ledOk: true },
  });
  const pages = ["/", "/consent", "/network", "/compass", "/locate", "/confirm", "/done", "/fallback"];
  for (const p of pages) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const name = p === "/" ? "landing" : p.slice(1);
    await fs.mkdir(path.join(OUT, `pages-${vpName}`), { recursive: true });
    const file = path.join(OUT, `pages-${vpName}`, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({ scenario: `pages-${vpName}`, name, file: path.relative(OUT, file) });
    console.log(`  pages-${vpName}/${name}`);
  }
  await context.close();
}

async function scenarioRouter(browser, vpName, fx) {
  const { context, page } = await openPage(browser, vpName);
  await page.goto(BASE + "/router");
  await waitForCamera(page);
  const scenario = `router-${vpName}`;
  await clear(page);
  await shoot(page, scenario, "1-scanning");
  const modem = fx.find((f) => f.short === "WA-08_54_36-4-") ?? fx.find((f) => has(f, "modem"));
  await show(page, modem);
  await settle(page);
  await shoot(page, scenario, "2-detecting", { fixture: modem.short });
  await page.getByText(/Rozpoznali jsme|Router rozpoznán/).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  await shoot(page, scenario, "3-recognized", { fixture: modem.short });
  await context.close();
}

function gates(fx) {
  return {
    power: fx.filter((f) => has(f, "powcab") && !has(f, "pow") && has(f, "modem")),
    sim: fx.filter((f) => has(f, "siminside") && has(f, "modem")),
    led: fx.filter((f) => (f.counts.on ?? 0) >= 3),
  };
}

async function scenarioInstall(browser, vpName, fx) {
  const { context, page } = await openPage(browser, vpName);
  const scenario = `install-${vpName}`;
  const g = gates(fx);
  await page.goto(BASE + "/install");
  await waitForCamera(page);

  await clear(page);
  await settle(page, false);
  await shoot(page, scenario, "1a-power-scanning");
  const pow = fx.find((f) => f.short === "PXL_20250410_100109264_MP") ?? fx.find((f) => has(f, "pow"));
  await show(page, pow);
  await settle(page);
  await shoot(page, scenario, "1b-power-connector", { fixture: pow.short });
  const powDone = await passStep(page, g.power, "power");
  await settle(page);
  await shoot(page, scenario, "1c-power-done", { fixture: powDone.short });
  await nextButton(page).click();

  const simOpen = fx.find((f) => has(f, "sim") && !has(f, "siminside"));
  await clear(page);
  await show(page, simOpen);
  await settle(page);
  await shoot(page, scenario, "2a-sim-slot", { fixture: simOpen.short });
  const simDone = await passStep(page, g.sim, "sim");
  await settle(page);
  await shoot(page, scenario, "2b-sim-done", { fixture: simDone.short });
  await nextButton(page).click();

  const button = fx.find((f) => f.short === "IMG_0059") ?? fx.find((f) => has(f, "onbutton"));
  await clear(page);
  await show(page, button);
  await settle(page);
  await shoot(page, scenario, "3-button", { fixture: button.short });
  await nextButton(page).click();

  const booting = fx.find((f) => has(f, "orange"));
  await clear(page);
  await show(page, booting);
  await settle(page);
  await shoot(page, scenario, "4a-led-booting", { fixture: booting.short });
  const ledDone = await passStep(page, g.led, "led");
  await settle(page);
  await shoot(page, scenario, "4b-led-ok", { fixture: ledDone.short });
  await nextButton(page).click();
  await page.waitForURL(/\/done/, { timeout: 10000 });
  await page.waitForTimeout(600);
  await shoot(page, scenario, "5-done");
  await context.close();
}

/** Every fixture that shows the current step's connectors, rendered on that step. */
async function scenarioGallery(browser, vpName, fx) {
  const g = gates(fx);
  // `done` = photos that would satisfy the step's gate. The gate latches, so
  // those go last — otherwise every photo after the first one would render
  // the finished state and never show a callout.
  const steps = [
    { key: "power", pick: (f) => has(f, "pow", "powcab"), done: (f) => has(f, "powcab") },
    { key: "sim", pick: (f) => has(f, "sim", "siminside", "simopen"), done: (f) => has(f, "siminside") },
    { key: "button", pick: (f) => has(f, "onbutton"), done: () => false },
    { key: "led", pick: (f) => has(f, "on", "off", "orange"), done: (f) => (f.counts.on ?? 0) >= 3 },
  ];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const { context, page } = await openPage(browser, vpName);
    await page.goto(BASE + "/install");
    await waitForCamera(page);
    if (i > 0) await passStep(page, g.power, "power").then(() => nextButton(page).click());
    if (i > 1) await passStep(page, g.sim, "sim").then(() => nextButton(page).click());
    if (i > 2) await nextButton(page).click();
    const scenario = `gallery-${step.key}`;
    const photos = fx.filter(step.pick);
    for (const f of [...photos.filter((f) => !step.done(f)), ...photos.filter(step.done)]) {
      await clear(page);
      await show(page, f);
      await settle(page);
      await shoot(page, scenario, f.short, { fixture: f.short, truth: f.counts });
    }
    await context.close();
  }
}

async function scenarioLocate(browser, vpName) {
  const { context, page } = await openPage(browser, vpName, { session: { ...XIAOMI, measurementCapable: true } });
  const scenario = `locate-${vpName}`;
  await page.goto(BASE + "/locate", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Simulace/ }).click();
  await page.waitForTimeout(6000);
  await shoot(page, scenario, "1-early");
  await page.waitForTimeout(22000);
  await shoot(page, scenario, "2-mapped");
  await context.close();
}

// ---------------------------------------------------------------- output

async function writeIndex() {
  const groups = new Map();
  for (const e of report) {
    if (!groups.has(e.scenario)) groups.set(e.scenario, []);
    groups.get(e.scenario).push(e);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sections = [...groups]
    .map(([name, entries]) => {
      const cards = entries
        .map((e) => {
          const flags = e.geometry ? issues(e.geometry) : [];
          const truth = e.truth ? Object.entries(e.truth).map(([k, v]) => `${k}×${v}`).join(" ") : "";
          return `<figure><img src="${esc(e.file)}"><figcaption><b>${esc(e.name)}</b>${
            truth ? `<br>${esc(truth)}` : ""
          }${flags.length ? `<br><span class="warn">${esc(flags.join("; "))}</span>` : ""}</figcaption></figure>`;
        })
        .join("");
      return `<section id="${esc(name)}"><h2>${esc(name)}</h2><div class="grid">${cards}</div></section>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><title>AR preview</title><style>
    body{font:13px system-ui,sans-serif;margin:16px;background:#f4f4f4;color:#1a1a1a}
    h2{margin:24px 0 8px;font-size:16px}
    .grid{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
    figure{margin:0;background:#fff;padding:6px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    figure img{display:block;height:360px;width:auto;border-radius:4px}
    figcaption{padding-top:4px;max-width:240px;font-size:11px;line-height:1.4}
    .warn{color:#b91c1c}
  </style>${sections}`;
  await fs.writeFile(path.join(OUT, "index.html"), html);
  await fs.writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  return [...groups.keys()];
}

/** One PNG contact sheet per scenario, rendered from the index page. */
async function writeSheets(browser, scenarios) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto("file://" + path.join(OUT, "index.html"));
  await page.waitForLoadState("load");
  for (const name of scenarios) {
    const section = page.locator(`section[id="${name}"]`);
    await section.screenshot({ path: path.join(OUT, `sheet-${name}.png`) });
  }
  await context.close();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? "1" : argv[++i];
  }
  return out;
}

// ---------------------------------------------------------------- main

const fixtures = await loadFixtures();
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
try {
  if (ONLY.has("pages")) await scenarioPages(browser, GALLERY_VIEWPORT);
  for (const vp of FLOW_VIEWPORTS) {
    if (ONLY.has("router")) await scenarioRouter(browser, vp, fixtures);
    if (ONLY.has("install")) await scenarioInstall(browser, vp, fixtures);
  }
  if (ONLY.has("gallery")) await scenarioGallery(browser, GALLERY_VIEWPORT, fixtures);
  if (ONLY.has("locate")) for (const vp of FLOW_VIEWPORTS) await scenarioLocate(browser, vp);
} finally {
  const scenarios = await writeIndex();
  await writeSheets(browser, scenarios).catch((e) => console.warn("sheet rendering failed:", e.message));
  await browser.close();
}

const flagged = report.filter((e) => e.geometry && issues(e.geometry).length);
console.log(`\n${report.length} screenshots, ${flagged.length} with overlay issues → ${path.relative(ROOT, OUT)}/index.html`);
if (flagged.length && args.strict) process.exitCode = 1;
