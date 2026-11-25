/** Example pay-band maths for the homepage sales tracker scene. Demo figures only. */

export type PayBand = {
  minPct: number;
  rate: number;
  label: string;
};

export type PayFigures = {
  units: number;
  gp: number;
  finance: number;
  aftercare: number;
  used: number;
};

export type PayBreakdown = PayFigures & {
  volume: number;
  gpPay: number;
  total: number;
};

export const VOLUME_TARGET = 20;
export const GP_TARGET = 8000;

/** Six volume bands: percent of the monthly unit target, and the per-unit rate. */
export const VOLUME_BANDS: readonly PayBand[] = [
  { minPct: 0, rate: 20, label: "<50%" },
  { minPct: 50, rate: 30, label: "50%" },
  { minPct: 65, rate: 40, label: "65%" },
  { minPct: 80, rate: 50, label: "80%" },
  { minPct: 90, rate: 65, label: "90%" },
  { minPct: 100, rate: 80, label: "100%+" },
];

/** Six gross-profit bands: percent of the monthly GP target, paid per unit. */
export const GP_BANDS: readonly PayBand[] = [
  { minPct: 0, rate: 6, label: "<50%" },
  { minPct: 50, rate: 8, label: "50%" },
  { minPct: 65, rate: 10, label: "65%" },
  { minPct: 80, rate: 12, label: "80%" },
  { minPct: 90, rate: 14, label: "90%" },
  { minPct: 100, rate: 16, label: "100%+" },
];

/** Mid-month start and near-target end, used to drive the scroll animation. */
export const PAY_DEMO = {
  start: { units: 14, gp: 5200, finance: 160, aftercare: 45, used: 60 } satisfies PayFigures,
  end: { units: 18, gp: 6400, finance: 240, aftercare: 95, used: 120 } satisfies PayFigures,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function pctOf(current: number, target: number): number {
  if (target <= 0) return 0;
  return (current / target) * 100;
}

export function bandIndex(bands: readonly PayBand[], pct: number): number {
  let i = 0;
  for (let k = 0; k < bands.length; k++) {
    if (pct >= bands[k].minPct) i = k;
  }
  return i;
}

export function currentBand(bands: readonly PayBand[], pct: number): PayBand {
  return bands[bandIndex(bands, pct)];
}

export function nextBand(bands: readonly PayBand[], pct: number): PayBand | null {
  return bands[bandIndex(bands, pct) + 1] ?? null;
}

/** Whole units still needed to reach the next volume band. */
export function unitsToNext(units: number, target: number, bands: readonly PayBand[]): number {
  const next = nextBand(bands, pctOf(units, target));
  if (!next) return 0;
  return Math.max(0, Math.ceil((next.minPct / 100) * target - units));
}

/** Pounds of GP still needed to reach the next GP band. */
export function gpToNext(gp: number, target: number, bands: readonly PayBand[]): number {
  const next = nextBand(bands, pctOf(gp, target));
  if (!next) return 0;
  return Math.max(0, Math.ceil((next.minPct / 100) * target - gp));
}

export function volumeHint(units: number, target: number, bands: readonly PayBand[]): string {
  const next = nextBand(bands, pctOf(units, target));
  if (!next) return "Top band reached.";
  const n = unitsToNext(units, target, bands);
  const unitWord = n === 1 ? "unit" : "units";
  return `${n} more ${unitWord} to £${next.rate} per unit`;
}

export function gpHint(gp: number, target: number, bands: readonly PayBand[]): string {
  const next = nextBand(bands, pctOf(gp, target));
  if (!next) return "Top band reached.";
  const more = gpToNext(gp, target, bands);
  return `£${more.toLocaleString("en-GB")} more GP to the next band`;
}

export function volumePay(units: number, bands: readonly PayBand[], target: number): number {
  return units * currentBand(bands, pctOf(units, target)).rate;
}

export function gpPay(units: number, gp: number, bands: readonly PayBand[], target: number): number {
  return units * currentBand(bands, pctOf(gp, target)).rate;
}

export function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export function lerpFigures(from: PayFigures, to: PayFigures, t: number): PayFigures {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    units: Math.round(lerp(from.units, to.units, u)),
    gp: Math.round(lerp(from.gp, to.gp, u) / 20) * 20,
    finance: Math.round(lerp(from.finance, to.finance, u)),
    aftercare: Math.round(lerp(from.aftercare, to.aftercare, u)),
    used: Math.round(lerp(from.used, to.used, u)),
  };
}

export function payBreakdown(fig: PayFigures): PayBreakdown {
  const volume = volumePay(fig.units, VOLUME_BANDS, VOLUME_TARGET);
  const earnedGp = gpPay(fig.units, fig.gp, GP_BANDS, GP_TARGET);
  return {
    ...fig,
    volume,
    gpPay: earnedGp,
    total: volume + earnedGp + fig.finance + fig.aftercare + fig.used,
  };
}
