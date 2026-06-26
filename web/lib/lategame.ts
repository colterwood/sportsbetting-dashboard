// Late-game totals: turn a sample of historical "points-from-here" outcomes into a
// distribution, a modeled P(over the line), an empirical hit rate, and an
// outlier-framed Edge/Fade verdict. This is the dashboard-native version of the
// HuggingFace app's summarize_anchor_rows + model_params_* + model_prob_over.
//
// The north star is OUTLIER finding: the edge is when the market's number sits in
// the TAIL of the historical conditional distribution (line in the low tail ->
// outcomes usually clear it -> OVER edge, and vice-versa).

import { probOver as probOverT } from "./tdist";

export type Bin = { lo: number; hi: number; count: number };
export type Dist = {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  histogram: Bin[];
};

/** Parse a number or a simple "a + b" / "a - b" expression (e.g. "147.5 - 120"). */
export function toFloat(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = input.trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[3]);
    return m[2] === "+" ? a + b : a - b;
  }
  return null;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function histogram(values: number[], min: number, max: number): Bin[] {
  const n = values.length;
  const nbins = n >= 8 ? Math.min(20, Math.max(8, Math.round(n / 8))) : Math.max(1, n);
  const span = max - min || 1;
  const bins: Bin[] = Array.from({ length: nbins }, (_, i) => ({
    lo: min + (span * i) / nbins,
    hi: min + (span * (i + 1)) / nbins,
    count: 0,
  }));
  for (const v of values) {
    let k = Math.floor(((v - min) / span) * nbins);
    if (k < 0) k = 0;
    if (k >= nbins) k = nbins - 1;
    bins[k].count++;
  }
  return bins;
}

/** Mean/sd/percentiles/histogram of an outcome sample. null if empty. */
export function summarize(values: number[]): Dist | null {
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean,
    sd: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    histogram: histogram(sorted, sorted[0], sorted[n - 1]),
  };
}

/** Predictive standard error for a single future game (estimation + game-to-game). */
function predictiveSE(d: Dist): number {
  return d.sd * Math.sqrt(1 + 1 / d.n);
}

/** Modeled P(outcome > line) via Student-t, mirroring the HF app's model_prob_over. */
export function probOver(line: number, d: Dist): number {
  return probOverT(line, d.mean, predictiveSE(d), Math.max(1, d.n - 1));
}

/** Empirical hit counts vs the line (push = exactly on the line). */
export function hitRate(values: number[], line: number): { over: number; under: number; push: number; n: number } {
  let over = 0,
    under = 0,
    push = 0;
  for (const v of values) {
    if (v > line) over++;
    else if (v < line) under++;
    else push++;
  }
  return { over, under, push, n: values.length };
}

/** Percent of historical outcomes at or below the line (where the line falls). */
export function linePercentile(values: number[], line: number): number {
  if (values.length === 0) return NaN;
  let below = 0;
  for (const v of values) if (v <= line) below++;
  return (below / values.length) * 100;
}

export type Verdict = {
  side: "over" | "under";
  strength: "strong" | "lean" | "none";
  overProb: number; // modeled P(over)
  linePct: number; // line's percentile in history
  label: string; // "Strong OVER" | "Lean UNDER" | "No edge"
  cls: string; // tailwind classes for the badge
};

/**
 * Outlier verdict: how far the modeled over-probability sits from a coin flip.
 * strong >= 80/20, lean >= 68/32, else no edge. Color by conviction, not by
 * over/under (this isn't a team good/bad axis).
 */
export function verdict(line: number, d: Dist, values: number[]): Verdict {
  const overProb = probOver(line, d);
  const side: "over" | "under" = overProb >= 0.5 ? "over" : "under";
  const edge = Math.abs(overProb - 0.5);
  const strength = edge >= 0.3 ? "strong" : edge >= 0.18 ? "lean" : "none";
  const dir = side === "over" ? "OVER" : "UNDER";
  const label = strength === "none" ? "No edge" : `${strength === "strong" ? "Strong" : "Lean"} ${dir}`;
  const cls =
    strength === "strong"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : strength === "lean"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-slate-700/30 text-slate-400 border-slate-600/40";
  return { side, strength, overProb, linePct: linePercentile(values, line), label, cls };
}

export function fmtPct(p: number): string {
  return Number.isFinite(p) ? `${Math.round(p)}%` : "—";
}
