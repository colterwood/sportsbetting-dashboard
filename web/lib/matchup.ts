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

// Color by whether the value FAVORS OFFENSE/scoring in this matchup (betting lens),
// NOT by whether the team is "good":
//   green ("good")  = offense success high  OR  defense leaky (allows a lot)
//   red   ("bad")   = offense success low   OR  defense stingy
// Uses the raw rank (by value desc). Neutral metrics get no color.
export function scoringFavor(
  higherIs: string,
  side: "off" | "def" | null,
  rank: number | null,
  leagueN: number | null,
): Quality {
  if (higherIs === "neutral" || side == null || rank == null || leagueN == null || leagueN < 4)
    return "neutral";
  // does a HIGH raw value favor the offense in this matchup?
  const favorableWhenHigh =
    (side === "off" && higherIs === "good_for_team") || (side === "def" && higherIs === "bad_for_team");
  const favRank = favorableWhenHigh ? rank : leagueN + 1 - rank; // 1 = most favorable for offense
  const p = favRank / leagueN;
  if (p <= 0.25) return "good";
  if (p >= 0.75) return "bad";
  return "neutral";
}
