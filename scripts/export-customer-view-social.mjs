#!/usr/bin/env node
/**
 * Export public/marketing/customer-view-social.png (1200×630).
 *
 * 1. Capture homepage #customer-view phone BEZEL at 1:1 CSS pixels (deviceScaleFactor 2)
 *    with Order Progress scrolled into view.
 * 2. Composite into OG canvas with UNIFORM scale only (object-fit: contain).
 *    Never stretch-to-fill the bezel - letterbox/pillarbox if needed so discs stay circular.
 *
 * Usage:
 *   node scripts/export-customer-view-social.mjs [--url http://127.0.0.1:8080/]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/marketing/customer-view-social.png");
const W = 1200;
const H = 630;

const url = (() => {
  const i = process.argv.indexOf("--url");
  return i >= 0 ? process.argv[i + 1] : "http://127.0.0.1:8080/";
})();

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator("#customer-view").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  // Capture-only: freeze motion so the amber pill is sharp in the PNG.
  await page.addStyleTag({
    content: `
      #customer-view .stage-disc {
        aspect-ratio: 1 / 1 !important;
        flex-shrink: 0 !important;
      }
      #customer-view .now-pill,
      #customer-view .arrived-pill {
        animation: none !important;
      }
    `,
  });

  // Bezel only - exclude "Real Customer view..." caption under the phone.
  const target = page
    .locator("#customer-view div.relative.overflow-hidden")
    .filter({ has: page.locator(".customer-phone-scroll") })
    .first();
  await target.waitFor({ state: "visible", timeout: 15000 });

  await page.locator("#customer-view .customer-phone-scroll").waitFor({ state: "visible" });

  // Centre Order Progress rail in the glass.
  await page.evaluate(() => {
    const root = document.querySelector("#customer-view .customer-phone-scroll");
    if (!root) return;
    const progress = root.querySelector(".progress-rail");
    if (!progress) return;
    const top =
      progress.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTop = Math.max(0, top - 90);
  });
  await page
    .locator("#customer-view .progress-rail, #customer-view .now-pill, #customer-view .stage-disc")
    .first()
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);

  const phoneMeta = await target.boundingBox();
  if (!phoneMeta) throw new Error("No bounding box for phone frame");
  const phonePng = await target.screenshot({ type: "png", animations: "disabled" });
  const aspect = phoneMeta.width / phoneMeta.height;
  console.log(
    "captured phone CSS px",
    phoneMeta.width,
    phoneMeta.height,
    "aspect",
    aspect.toFixed(3),
    "png bytes",
    phonePng.length,
  );
  if (aspect < 0.5 || aspect > 0.62) {
    throw new Error(
      `Phone aspect ${aspect.toFixed(3)} outside handset range 0.50-0.62 - refuse non-uniform bezel`,
    );
  }

  const dataUrl = `data:image/png;base64,${phonePng.toString("base64")}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: Inter;
    src: url("file:///usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf") format("truetype");
    font-weight: 100 900;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0a0b0a; }
  .canvas {
    width: ${W}px; height: ${H}px;
    display: grid;
    grid-template-columns: 1.08fr 0.92fr;
    background:
      radial-gradient(ellipse 55% 50% at 8% 88%, rgba(217,162,75,0.10), transparent 55%),
      radial-gradient(ellipse 45% 55% at 92% 12%, rgba(76,126,216,0.10), transparent 50%),
      #0a0b0a;
    font-family: Inter, system-ui, sans-serif;
    color: #f4f4f2;
    -webkit-font-smoothing: antialiased;
  }
  .left {
    padding: 56px 40px 48px 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .brand {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #8b8e89;
  }
  .eyebrow {
    margin-top: 18px;
    font-size: 14px;
    font-weight: 600;
    color: #d9a24b;
  }
  h1 {
    margin-top: 12px;
    font-size: 40px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.12;
    max-width: 14ch;
  }
  .body {
    margin-top: 16px;
    font-size: 16px;
    line-height: 1.45;
    color: #c8ccd4;
    max-width: 34ch;
  }
  .pills {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pill {
    border: 1px solid rgba(255,255,255,0.22);
    background: rgba(22,24,28,0.9);
    color: #f4f4f2;
    font-size: 12.5px;
    font-weight: 500;
    padding: 8px 14px;
    border-radius: 999px;
  }
  .url {
    margin-top: 36px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: #6b6e68;
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px 56px 28px 8px;
  }
  .phone-slot {
    width: 100%;
    height: 574px;
    max-width: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .phone-slot img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain; /* UNIFORM - never stretch */
    border-radius: 2.2rem;
    box-shadow: 0 28px 64px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.35);
  }
</style>
</head>
<body>
  <div class="canvas" id="og">
    <div class="left">
      <div class="brand">FORECOURT · FORECOURT.ME</div>
      <div class="eyebrow">What the customer sees</div>
      <h1>Order progress, to-dos, live status.</h1>
      <p class="body">The buyer opens their order on their phone. Fewer chasing calls. Sits beside your CRM, not instead of it.</p>
      <div class="pills">
        <span class="pill">Order Progress</span>
        <span class="pill">Your Outstanding Tasks</span>
        <span class="pill">Live status</span>
      </div>
      <div class="url">forecourt.me/demo?view=customer</div>
    </div>
    <div class="right">
      <div class="phone-slot">
        <img id="phone" alt="" />
      </div>
    </div>
  </div>
</body>
</html>`;

  const comp = await browser.newPage();
  await comp.setViewportSize({ width: W, height: H });
  await comp.setContent(html, { waitUntil: "load" });
  await comp.evaluate((src) => {
    const img = document.getElementById("phone");
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("phone img failed"));
      img.src = src;
    });
  }, dataUrl);
  await comp.waitForTimeout(150);

  const fit = await comp.evaluate(() => {
    const img = document.getElementById("phone");
    const r = img.getBoundingClientRect();
    const scaleX = r.width / img.naturalWidth;
    const scaleY = r.height / img.naturalHeight;
    return {
      box: { w: r.width, h: r.height },
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      scaleX,
      scaleY,
      uniform: Math.abs(scaleX - scaleY) < 0.002,
      aspectBox: r.width / r.height,
      aspectNat: img.naturalWidth / img.naturalHeight,
    };
  });
  console.log("fit check", fit);
  if (!fit.uniform) {
    throw new Error(`Non-uniform scale detected scaleX=${fit.scaleX} scaleY=${fit.scaleY}`);
  }
  if (fit.aspectBox < 0.5 || fit.aspectBox > 0.62) {
    throw new Error(`Composited phone aspect ${fit.aspectBox.toFixed(3)} outside handset range`);
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await comp.locator("#og").screenshot({ path: OUT, type: "png", animations: "disabled" });
  console.log("wrote", OUT);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
