// GTA VI launch-day Twitch viewers forecaster.
// Method: comparable-launch curves. For every past big launch in the case's
// comparables, take its release-day hourly curve as log-ratios to its own
// hour-1 print. For each forecast hour, pool those log-ratios with a
// Gaussian kernel weight: comparables whose launch looked like this one at
// hour 1 (similar hour-1 print relative to the previous evening's peak, and
// similar absolute hour-1 level) count most. The median of the weighted
// log-ratios, anchored on this case's hour-1 print, is the forecast median;
// the weighted spread of the log-ratios sets the five quantiles. Pure
// standard library, deterministic, no network, no randomness.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const Z: number[] = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];
const BANDWIDTH = 0.5;
const LEVEL_WEIGHT = 0.5;
const SPREAD = 0.9;
const SD_FLOOR = 0.1;
const HOUR_MS = 3600000;

type NumMap = Map<number, number>;

interface Comparable {
  p1: number;
  ratio: number;
  hours: NumMap;
}

function hourIndex(fromMs: number, dayStartMs: number): number {
  return Math.floor((fromMs - dayStartMs) / HOUR_MS) + 1;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

function weightedMedian(pairs: Array<[number, number]>): number {
  const s = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = s.reduce((acc, p) => acc + p[1], 0);
  let acc = 0;
  for (const [v, w] of s) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return s[s.length - 1][0];
}

function parseTime(value: unknown): number {
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : NaN;
}

function buildComparable(raw: any): Comparable | null {
  if (!raw || !Array.isArray(raw.hourly)) return null;
  // Each comparable is aligned on ITS OWN release day, not the target's:
  // its hourly curve is indexed by hours since its own day_start.
  const dayStartMs = parseTime(raw.day_start);
  if (!Number.isFinite(dayStartMs)) return null;
  const hours: NumMap = new Map();
  let prePeak = 0;
  for (const p of raw.hourly) {
    const v = Number(p?.viewers);
    if (!Number.isFinite(v) || v <= 0) continue;
    const t = parseTime(p?.from);
    if (!Number.isFinite(t)) continue;
    const h = hourIndex(t, dayStartMs);
    if (h >= 1 && h <= 24) {
      if (!hours.has(h)) hours.set(h, v);
    } else if (h >= -24 && h <= 0) {
      if (v > prePeak) prePeak = v;
    }
  }
  const p1 = hours.get(1);
  if (p1 === undefined || prePeak <= 0 || hours.size < 12) return null;
  return { p1, ratio: p1 / prePeak, hours };
}

function targetFeatures(kase: any): { p1: number; ratio: number } {
  const known = Array.isArray(kase.known) ? kase.known[0] : null;
  let p1 = Number(known?.viewers);
  if (!Number.isFinite(p1) || p1 < 1) p1 = 1;
  const dayStartMs = parseTime(kase.day_start);
  let prePeak = 0;
  let anyPeak = 0;
  if (Array.isArray(kase.history_hourly)) {
    for (const p of kase.history_hourly) {
      const v = Number(p?.viewers);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (v > anyPeak) anyPeak = v;
      const t = parseTime(p?.from);
      if (!Number.isFinite(t) || !Number.isFinite(dayStartMs)) continue;
      const h = hourIndex(t, dayStartMs);
      if (h >= -24 && h <= 0 && v > prePeak) prePeak = v;
    }
  }
  if (prePeak <= 0) prePeak = anyPeak > 0 ? anyPeak : p1;
  return { p1, ratio: p1 / prePeak };
}

function forecastHour(
  comps: Comparable[],
  p1: number,
  ratio: number,
  h: number,
): number[] {
  const pairs: Array<[number, number]> = [];
  for (const c of comps) {
    const v = c.hours.get(h);
    if (v === undefined || v <= 0) continue;
    const d =
      Math.abs(Math.log(c.ratio / ratio)) +
      LEVEL_WEIGHT * Math.abs(Math.log(c.p1 / p1));
    const w = Math.exp(-0.5 * (d / BANDWIDTH) ** 2);
    pairs.push([Math.log(v / c.p1), w]);
  }
  if (pairs.length === 0) {
    const s = 0.12 * Math.sqrt(h - 1);
    return Z.map((z) => p1 * Math.exp(z * s));
  }
  const mu = weightedMedian(pairs);
  const devs = pairs.map(([v, w]) => [Math.abs(v - mu), w] as [number, number]);
  const mad = weightedMedian(devs);
  const sd = Math.max(1.4826 * mad, SD_FLOOR);
  return Z.map((z) => p1 * Math.exp(mu + z * SPREAD * sd));
}

function forecastCase(kase: any): { hours: Array<{ hour: number; q: number[] }> } {
  const { p1, ratio } = targetFeatures(kase);
  const comps: Comparable[] = [];
  if (Array.isArray(kase.comparables)) {
    for (const raw of kase.comparables) {
      const c = buildComparable(raw);
      if (c) comps.push(c);
    }
  }
  const hours: Array<{ hour: number; q: number[] }> = [];
  for (let h = 2; h <= 24; h++) {
    const raw = forecastHour(comps, p1, ratio, h);
    const q: number[] = [];
    let prev = 0;
    for (const v of raw) {
      let x = Number.isFinite(v) ? v : p1;
      if (x < 1) x = 1;
      if (x > 1e9) x = 1e9;
      x = Math.round(x * 100) / 100;
      if (x < prev) x = prev;
      q.push(x);
      prev = x;
    }
    hours.push({ hour: h, q });
  }
  return { hours };
}

function main(): void {
  const inputDir = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outputDir, { recursive: true });
  const files = readdirSync(inputDir)
    .filter((f) => f.endsWith(".in"))
    .sort();
  for (const file of files) {
    const kase = JSON.parse(readFileSync(join(inputDir, file), "utf8"));
    const out = forecastCase(kase);
    const id = String(kase.id || file.replace(/\.in$/, ""));
    writeFileSync(join(outputDir, `${id}.out`), JSON.stringify(out));
  }
}

main();
