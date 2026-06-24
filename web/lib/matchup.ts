// Matchup helpers: pair a metric's offense/defense variants into a "family", and
// turn the stored rank into a good-direction rank (1 = best) for display.

export const FAMILY_LABELS: Record<string, string> = {
  scoring_drive_rate: "Scoring Drive Rate",
  yards_per_play: "Yards / Play",
  plays_per_drive: "Plays / Drive",
  three_and_out_rate: "3 & Out Rate",
  td_drive_rate: "TD Drive Rate",
  points_per_drive: "Points / Drive",
  explosive_rate: "Explosive Rate",
  yards_per_pass: "Yards / Pass",
  yards_per_run: "Yards / Run",
  secs_per_play: "Secs / Play",
  secs_per_drive: "Secs / Drive",
  pass_rate: "Pass Rate",
};

// Always-shown top 4 (fixed order), then everything else.
export const TOP_FAMILIES = [
  "scoring_drive_rate",
  "yards_per_play",
  "plays_per_drive",
  "three_and_out_rate",
];
const OTHER_FAMILIES = [
  "td_drive_rate",
  "points_per_drive",
  "explosive_rate",
  "yards_per_pass",
  "yards_per_run",
  "secs_per_play",
  "secs_per_drive",
  "pass_rate",
];
export const PAIRED_FAMILIES = [...TOP_FAMILIES, ...OTHER_FAMILIES];

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

export function shortSituation(key: string): string {
  return (
    ({ game: "Game", h1: "1H", h2: "2H", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" } as Record<string, string>)[
      key
    ] ?? key.toUpperCase()
  );
}

// Stored rank is by value desc (1 = highest value). Flip for "bad-when-high"
// metrics so 1 = best in the good direction.
export function goodRank(higherIs: string, rank: number | null, leagueN: number | null): number | null {
  if (rank == null || leagueN == null) return null;
  return higherIs === "bad_for_team" ? leagueN + 1 - rank : rank;
}

export type Quality = "good" | "bad" | "neutral";

// Color a cell ONLY when the team is a true outlier (is_tail = robust median/MAD
// modified z >= threshold, set in build_metrics), oriented by whether that outlier
// FAVORS OFFENSE/scoring in this matchup (betting lens):
//   green ("good") = offense outlier-high (elite) OR defense outlier-high (leaky)
//   red   ("bad")  = offense outlier-low (weak)   OR defense outlier-low (stingy)
// Non-outliers and neutral metrics get no color.
export function cellColor(
  higherIs: string,
  side: "off" | "def" | null,
  isTail: boolean,
  tailSide: "high" | "low" | null,
): Quality {
  if (!isTail || tailSide == null || side == null || higherIs === "neutral") return "neutral";
  const favorableWhenHigh =
    (side === "off" && higherIs === "good_for_team") || (side === "def" && higherIs === "bad_for_team");
  const high = tailSide === "high";
  return high === favorableWhenHigh ? "good" : "bad";
}
