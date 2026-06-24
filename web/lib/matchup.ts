// Matchup helpers: pair a metric's offense and defense variants into a "family",
// and orient z-scores so a positive number always means "favorable for the
// offense" in a given matchup (so A-offense vs B-defense edges are comparable).

export const FAMILY_LABELS: Record<string, string> = {
  scoring_drive_rate: "Scoring-Drive Rate",
  td_drive_rate: "TD-Drive Rate",
  points_per_drive: "Points / Drive",
  explosive_rate: "Explosive-Play Rate",
  yards_per_play: "Yards / Play",
  three_and_out_rate: "3-and-Out Rate",
  secs_per_drive: "Pace (Secs / Drive)",
};

// Families that have BOTH an _off and a _def metric (so they pair into a matchup).
export const PAIRED_FAMILIES = Object.keys(FAMILY_LABELS);

export function familyOf(metricId: string): string {
  return metricId.replace(/_(off|def)$/, "");
}

export function sideOf(metricId: string): "off" | "def" | null {
  const m = metricId.match(/_(off|def)$/);
  return m ? (m[1] as "off" | "def") : null;
}

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family.replace(/_/g, " ");
}

// z oriented so positive == favorable for the OFFENSE in this matchup.
// Offense metric: good_for_team high -> good. Defense metric: bad_for_team high
// (allows a lot) -> the defense is leaky -> good for the opposing offense.
export function attackZ(
  higherIs: string,
  side: "off" | "def" | null,
  z: number | null,
): number {
  if (z == null || !side || higherIs === "neutral") return 0;
  if (side === "off") return higherIs === "good_for_team" ? z : -z;
  return higherIs === "bad_for_team" ? z : -z;
}

// Combined edge for an offense attacking a defense: both oriented toward "offense
// favored". Strongly positive => the offense has a clear edge in this family.
export function matchupEdge(
  offHigherIs: string,
  offZ: number | null,
  defHigherIs: string,
  defZ: number | null,
): number {
  return attackZ(offHigherIs, "off", offZ) + attackZ(defHigherIs, "def", defZ);
}

// Plain-language, average-person metric names (no jargon).
export const SHORT_LABELS: Record<string, string> = {
  yards_per_play: "Moves the ball",
  scoring_drive_rate: "Scoring drives",
  td_drive_rate: "Touchdowns",
  points_per_drive: "Points / drive",
  explosive_rate: "Big plays",
  three_and_out_rate: "Avoids 3-&-outs",
  secs_per_drive: "Tempo",
};
export function shortLabel(family: string): string {
  return SHORT_LABELS[family] ?? familyLabel(family);
}

export type Tier = "strong" | "lean" | "even" | "against";

// Per-driver tier (one family's combined edge).
export function driverTier(edge: number): Tier {
  if (edge >= 2) return "strong";
  if (edge >= 0.8) return "lean";
  if (edge > -0.8) return "even";
  return "against";
}
// Overall tier for a possession (mean edge across families).
export function overallTier(meanEdge: number): Tier {
  if (meanEdge >= 1.2) return "strong";
  if (meanEdge >= 0.5) return "lean";
  if (meanEdge > -0.5) return "even";
  return "against";
}
export const TIER_DOT: Record<Tier, string> = {
  strong: "#34d399",
  lean: "#6ee7b7",
  even: "#64748b",
  against: "#fb7185",
};

export function shortSituation(key: string): string {
  return (
    { game: "Game", h1: "1H", h2: "2H", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" }[key] ??
    key.toUpperCase()
  );
}
