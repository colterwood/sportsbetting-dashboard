// Late-game totals: turn a sample of historical "points-from-here" outcomes into a
// distribution, a modeled P(over the line), an empirical hit rate, and an
// outlier-framed Edge/Fade verdict. This is the dashboard-native version of the
// HuggingFace app's summarize_anchor_rows + model_params_* + model_prob_over.
//
// The north star is OUTLIER finding: the edge is when the market's number sits in
// the TAIL of the historical conditional distribution (line in the low tail ->
// outcomes usually clear it -> OVER edge, and vice-versa).

import { probOver as probOverT } from "./tdist";
import type { TeamSituationRow } from "./queries";

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
  return verdictAt(line, d.mean, d, values);
}

/**
 * verdict() with an OVERRIDING mean (e.g. the team-adjusted expectation) while
 * keeping the sample's spread: SE and degrees of freedom still come from `d`.
 * `values` is the same historical sample, used only for the line's percentile.
 */
export function verdictAt(line: number, mean: number, d: Dist, values: number[]): Verdict {
  const overProb = probOverT(line, mean, predictiveSE(d), Math.max(1, d.n - 1));
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

// ---- team-conditioned layer ----------------------------------------------
// The league distribution answers "what usually happens from this state"; the
// functions below tilt that toward HOW THESE TWO TEAMS play the state, using the
// ncaam_team_situation profiles (per-window/per-margin-band accumulators).

export type WindowKey = "h1_0_240" | "h2_240_480" | "h2_120_240" | "h2_0_120";
export type MarginBand = "1_3" | "4_6" | "7_12" | "13p";

/** Margin-band chain, in order — used for nearest-first widening. */
const BANDS: MarginBand[] = ["1_3", "4_6", "7_12", "13p"];

/**
 * Snap a game state to its profile window. Half 1 has a single late window
 * (final 4:00); half 2 splits into 4:00–8:00, 2:00–4:00, and the final 2:00.
 * Seconds beyond 8:00 in the 2nd half clamp to the outermost window.
 */
export function snapWindow(half: 1 | 2, secsLeftInHalf: number): WindowKey {
  if (half === 1) return "h1_0_240";
  if (secsLeftInHalf <= 120) return "h2_0_120";
  if (secsLeftInHalf <= 240) return "h2_120_240";
  return "h2_240_480"; // includes clamp beyond 480
}

/** Snap a lead margin to its profile band. */
export function snapBand(by: number): MarginBand {
  if (by <= 3) return "1_3";
  if (by <= 6) return "4_6";
  if (by <= 12) return "7_12";
  return "13p";
}

export type TeamRates = {
  ptsForPerMin: number;
  ptsAgainstPerMin: number;
  possPerMin: number;
  foulsPerMin: number;
  ftaPerMin: number;
  ftPct: number;
  gamesCur: number; // games in the most recent season present
  gamesPrev: number; // games in the season before that (0 if none)
  seasonCur: number;
  seasonPrev: number | null;
  fallback: "exact" | "band_widened" | "window_any_band";
};

/** Sum one season's rows into per-minute rates (accumulator / minutes). */
function seasonRates(rows: TeamSituationRow[]) {
  const sum = (f: (r: TeamSituationRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const minutes = sum((r) => r.minutes);
  const fta = sum((r) => r.fta);
  const per = (v: number) => (minutes > 0 ? v / minutes : 0);
  return {
    games: sum((r) => r.games),
    ptsFor: per(sum((r) => r.pts_for)),
    ptsAgainst: per(sum((r) => r.pts_against)),
    poss: per(sum((r) => r.poss)),
    fouls: per(sum((r) => r.fouls_committed)),
    fta: per(fta),
    ftPct: fta > 0 ? sum((r) => r.ftm) / fta : null,
  };
}

/**
 * One team's per-minute rates for a (role, window, margin-band) state, blended
 * across the two most recent seasons with data. If the exact band has no rows,
 * widen nearest-first: pool the band with its immediate neighbours in the
 * 1_3<->4_6<->7_12<->13p chain ("band_widened"), then every band in the window
 * ("window_any_band"). Season blend: wPrev = 15 / (15 + gamesCur) on the
 * PER-MINUTE rates (a ~15-game prior — early-season reads lean on last year);
 * a single season of data is used alone. Returns null if the team has no rows
 * for this role+window at all.
 */
export function teamRates(
  rows: TeamSituationRow[],
  team: string,
  role: "lead" | "trail",
  windowKey: WindowKey,
  band: MarginBand,
): TeamRates | null {
  const windowRows = rows.filter(
    (r) => r.team === team && r.role === role && r.window_key === windowKey,
  );
  if (windowRows.length === 0) return null;

  let matched = windowRows.filter((r) => r.margin_band === band);
  let fallback: TeamRates["fallback"] = "exact";
  if (matched.length === 0) {
    const i = BANDS.indexOf(band);
    const near = new Set<string>([band, ...BANDS.slice(Math.max(0, i - 1), i + 2)]);
    matched = windowRows.filter((r) => near.has(r.margin_band));
    fallback = "band_widened";
  }
  if (matched.length === 0) {
    matched = windowRows;
    fallback = "window_any_band";
  }

  // Blend the two most recent seasons among the matches.
  const seasons = [...new Set(matched.map((r) => r.season))].sort((a, b) => b - a);
  const seasonCur = seasons[0];
  const seasonPrev = seasons[1] ?? null;
  const cur = seasonRates(matched.filter((r) => r.season === seasonCur));
  const prev = seasonPrev != null ? seasonRates(matched.filter((r) => r.season === seasonPrev)) : null;

  const wPrev = prev ? 15 / (15 + cur.games) : 0;
  const mix = (c: number, p: number | undefined) => (prev && p != null ? (1 - wPrev) * c + wPrev * p : c);
  // FT% blends the same way but either season can lack attempts (guard fta 0).
  const ftPct =
    cur.ftPct != null && prev?.ftPct != null
      ? (1 - wPrev) * cur.ftPct + wPrev * prev.ftPct
      : (cur.ftPct ?? prev?.ftPct ?? 0);

  return {
    ptsForPerMin: mix(cur.ptsFor, prev?.ptsFor),
    ptsAgainstPerMin: mix(cur.ptsAgainst, prev?.ptsAgainst),
    possPerMin: mix(cur.poss, prev?.poss),
    foulsPerMin: mix(cur.fouls, prev?.fouls),
    ftaPerMin: mix(cur.fta, prev?.fta),
    ftPct,
    gamesCur: cur.games,
    gamesPrev: prev?.games ?? 0,
    seasonCur,
    seasonPrev,
    fallback,
  };
}

/**
 * Blend the league-conditional means with the two teams' situational rates.
 * Team expectation for the leader's points = the average of "what the leader
 * scores per minute in this state" and "what the trailer allows per minute",
 * times the minutes left (trailer symmetric; game total = the two summed).
 * A missing side falls back to the other alone; both missing = pure league.
 * Where team data exists each outcome is 0.8 team + 0.2 league; `teamShare`
 * reports the weight actually used for the game total, `notes` explains any
 * fallback in plain language.
 */
export function blendOutcomes(args: {
  minutesLeft: number;
  league: { total: number; lead: number; trail: number };
  leader: TeamRates | null;
  trailer: TeamRates | null;
}): { total: number; lead: number; trail: number; teamShare: number; notes: string[] } {
  const { minutesLeft, league, leader, trailer } = args;
  const TEAM_W = 0.8;
  const notes: string[] = [];

  // pts/min expectation for one side, from its offense and the opponent's defense
  const sideRate = (off: TeamRates | null, def: TeamRates | null): number | null => {
    if (off && def) return 0.5 * (off.ptsForPerMin + def.ptsAgainstPerMin);
    if (off) return off.ptsForPerMin;
    if (def) return def.ptsAgainstPerMin;
    return null;
  };

  const leadRate = sideRate(leader, trailer);
  const trailRate = sideRate(trailer, leader);

  const blendOne = (rate: number | null, leagueMean: number): number =>
    rate == null ? leagueMean : TEAM_W * rate * minutesLeft + (1 - TEAM_W) * leagueMean;

  const lead = blendOne(leadRate, league.lead);
  const trail = blendOne(trailRate, league.trail);
  const total =
    leadRate == null && trailRate == null
      ? league.total
      : TEAM_W * ((leadRate ?? 0) + (trailRate ?? 0)) * minutesLeft + (1 - TEAM_W) * league.total;
  const teamShare = leadRate == null && trailRate == null ? 0 : TEAM_W;

  if (!leader && trailer) notes.push("No profile for the leading team in this spot — using the trailing team's rates alone.");
  if (!trailer && leader) notes.push("No profile for the trailing team in this spot — using the leading team's rates alone.");
  if (!leader && !trailer) notes.push("Neither team has history in this situation — showing the league-wide numbers.");
  if (leader?.fallback === "band_widened") notes.push("Thin data for the leader at this exact margin — nearby margins included.");
  if (leader?.fallback === "window_any_band") notes.push("Very thin data for the leader — all margins in this time window included.");
  if (trailer?.fallback === "band_widened") notes.push("Thin data for the trailer at this exact margin — nearby margins included.");
  if (trailer?.fallback === "window_any_band") notes.push("Very thin data for the trailer — all margins in this time window included.");

  return { total, lead, trail, teamShare, notes };
}
