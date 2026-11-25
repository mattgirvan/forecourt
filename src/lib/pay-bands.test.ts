import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOLUME_BANDS,
  VOLUME_TARGET,
  GP_BANDS,
  GP_TARGET,
  PAY_DEMO,
  bandIndex,
  currentBand,
  nextBand,
  unitsToNext,
  gpToNext,
  volumeHint,
  gpHint,
  volumePay,
  gpPay,
  formatGbp,
  lerpFigures,
  payBreakdown,
  pctOf,
} from "./pay-bands.ts";

const BANNED = /Skoda|Škoda|John Clark|\bglass\b|\u2013|\u2014/;

test("volume bands: six rungs, current and next at the demo end", () => {
  assert.equal(VOLUME_BANDS.length, 6);
  assert.equal(pctOf(PAY_DEMO.end.units, VOLUME_TARGET), 90);
  assert.equal(currentBand(VOLUME_BANDS, 90).rate, 65);
  assert.equal(nextBand(VOLUME_BANDS, 90)?.rate, 80);
  assert.equal(unitsToNext(PAY_DEMO.end.units, VOLUME_TARGET, VOLUME_BANDS), 2);
  assert.equal(volumeHint(PAY_DEMO.end.units, VOLUME_TARGET, VOLUME_BANDS), "2 more units to £80 per unit");
  assert.equal(volumePay(PAY_DEMO.end.units, VOLUME_BANDS, VOLUME_TARGET), 18 * 65);
});

test("volume bands: mid-month start sits on 65%, two units from 80%", () => {
  assert.equal(pctOf(PAY_DEMO.start.units, VOLUME_TARGET), 70);
  assert.equal(currentBand(VOLUME_BANDS, 70).rate, 40);
  assert.equal(unitsToNext(PAY_DEMO.start.units, VOLUME_TARGET, VOLUME_BANDS), 2);
  assert.equal(volumeHint(14, VOLUME_TARGET, VOLUME_BANDS), "2 more units to £50 per unit");
  assert.equal(volumeHint(19, VOLUME_TARGET, VOLUME_BANDS), "1 more unit to £80 per unit");
  assert.equal(volumeHint(20, VOLUME_TARGET, VOLUME_BANDS), "Top band reached.");
  assert.equal(nextBand(VOLUME_BANDS, 100), null);
});

test("GP bands: demo end is on 80%, £800 from the next band", () => {
  assert.equal(GP_BANDS.length, 6);
  assert.equal(pctOf(PAY_DEMO.end.gp, GP_TARGET), 80);
  assert.equal(currentBand(GP_BANDS, 80).rate, 12);
  assert.equal(gpToNext(PAY_DEMO.end.gp, GP_TARGET, GP_BANDS), 800);
  assert.equal(gpHint(PAY_DEMO.end.gp, GP_TARGET, GP_BANDS), "£800 more GP to the next band");
  assert.equal(gpPay(PAY_DEMO.end.units, PAY_DEMO.end.gp, GP_BANDS, GP_TARGET), 18 * 12);
});

test("GP bands: start is on 65%, and the top band has no next step", () => {
  assert.equal(pctOf(PAY_DEMO.start.gp, GP_TARGET), 65);
  assert.equal(currentBand(GP_BANDS, 65).rate, 10);
  assert.equal(gpToNext(PAY_DEMO.start.gp, GP_TARGET, GP_BANDS), 1200);
  assert.equal(gpHint(8000, GP_TARGET, GP_BANDS), "Top band reached.");
});

test("bandIndex uses the highest threshold the percent has reached", () => {
  assert.equal(bandIndex(VOLUME_BANDS, 0), 0);
  assert.equal(bandIndex(VOLUME_BANDS, 49.9), 0);
  assert.equal(bandIndex(VOLUME_BANDS, 50), 1);
  assert.equal(bandIndex(VOLUME_BANDS, 89.9), 3);
  assert.equal(bandIndex(VOLUME_BANDS, 90), 4);
  assert.equal(bandIndex(VOLUME_BANDS, 110), 5);
});

test("demo totals at the start and end of the scroll", () => {
  const start = payBreakdown(PAY_DEMO.start);
  const end = payBreakdown(PAY_DEMO.end);
  assert.equal(start.volume, 560);
  assert.equal(start.gpPay, 140);
  assert.equal(start.total, 965);
  assert.equal(end.volume, 1170);
  assert.equal(end.gpPay, 216);
  assert.equal(end.total, 1841);
  assert.equal(formatGbp(end.total), "£1,841");
  assert.equal(formatGbp(0), "£0");
});

test("lerpFigures stays at the ends and snaps GP to £20", () => {
  assert.deepEqual(lerpFigures(PAY_DEMO.start, PAY_DEMO.end, 0), {
    ...PAY_DEMO.start,
    gp: 5200,
  });
  assert.deepEqual(lerpFigures(PAY_DEMO.start, PAY_DEMO.end, 1), PAY_DEMO.end);
  const mid = lerpFigures(PAY_DEMO.start, PAY_DEMO.end, 0.5);
  assert.equal(mid.units, 16);
  assert.equal(mid.gp % 20, 0);
  assert.ok(mid.gp > PAY_DEMO.start.gp && mid.gp < PAY_DEMO.end.gp);
});

test("hints and scene copy have no banned words or dashes", () => {
  const hints = [
    volumeHint(14, VOLUME_TARGET, VOLUME_BANDS),
    volumeHint(18, VOLUME_TARGET, VOLUME_BANDS),
    volumeHint(19, VOLUME_TARGET, VOLUME_BANDS),
    volumeHint(20, VOLUME_TARGET, VOLUME_BANDS),
    gpHint(5200, GP_TARGET, GP_BANDS),
    gpHint(6400, GP_TARGET, GP_BANDS),
    gpHint(8000, GP_TARGET, GP_BANDS),
  ];
  for (const h of hints) assert.doesNotMatch(h, BANNED);

  const scene = readFileSync("src/components/home-scroll-scenes.tsx", "utf8");
  const payStart = scene.indexOf("function PayScene(");
  assert.ok(payStart > 0, "PayScene is defined");
  const exportStart = scene.indexOf("export function HomeScrollScenes");
  const payFn = scene.slice(payStart, exportStart);
  assert.doesNotMatch(payFn, BANNED);
  assert.match(payFn, /eyebrow="Sales tracker"/);
  assert.match(payFn, /An example of what the sales tracker can show: this month's pay, and what it takes to reach the next band/);
  assert.match(payFn, /Example figures, for illustration\./);
  assert.match(payFn, /sm:hidden">Example figures</);
  assert.match(payFn, /is-next/);
  assert.match(payFn, /customer view|Sales tracker/);
  assert.doesNotMatch(payFn, /Motability|payslip|John Clark|portal/i);

  const list = scene.slice(exportStart);
  const overviewAt = list.indexOf("<OverviewScene />");
  const payAt = list.indexOf("<PayScene />");
  const groupAt = list.indexOf("<GroupScene />");
  assert.ok(overviewAt >= 0 && payAt > overviewAt && groupAt > payAt);
});

test("pay scene motion uses transform and opacity, and reduced motion is honoured", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const start = css.indexOf("/* Sales tracker: pay this month");
  assert.ok(start >= 0, "pay scene CSS block is present");
  const end = css.indexOf("/* ============================================================", start + 10);
  const block = css.slice(start, end);
  const transitions = [...block.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  for (const t of transitions) {
    assert.doesNotMatch(t, /width|height|top|left|margin|padding|max-height/);
  }
  const fills = [...block.matchAll(/@keyframes[\s\S]*?\{[\s\S]*?\n\}/g)].join("\n");
  assert.doesNotMatch(fills, /width|height|top|left|margin|padding|max-height/);
  assert.match(block, /prefers-reduced-motion: reduce/);
  assert.match(block, /transform: none !important/);
  assert.match(block, /opacity: 1 !important/);
  assert.match(block, /color: var\(--shell-text-dim\)/);
  assert.doesNotMatch(block, /font-size: 8px;/);

  const scene = readFileSync("src/components/home-scroll-scenes.tsx", "utf8");
  const payFn = scene.slice(scene.indexOf("function PayScene("), scene.indexOf("export function HomeScrollScenes"));
  assert.match(payFn, /useScrollScene/);
  assert.match(payFn, /translate3d/);
  assert.match(payFn, /scaleX|--p/);
});
