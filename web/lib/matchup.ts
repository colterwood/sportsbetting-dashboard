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
  yards_per_drive: "Yards / Drive",
  avg_start_pos: "Field Position",
  adj_start_pos: "Field Pos (adj)",
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
  "yards_per_drive",
  "avg_start_pos",
  "adj_start_pos",
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

// Color a matchup cell by how EXTREME the team is on the metric — the top/bottom
// PCT_EDGE% by value — oriented by whether that extreme FAVORS OFFENSE/scoring
// (betting lens): green = favorable extreme, red = unfavorable extreme.
//   green ("good") = offense top-tier (elite) OR defense top-tier (leaky)
//   red   ("bad")  = offense bottom-tier (weak) OR defense bottom-tier (stingy)
// We use PERCENTILE rather than the strict robust-outlier flag so the genuine
// extremes of ANY distribution color — including right-skewed ones like Pass Rate,
// whose high side never reaches a 2-MAD outlier. Neutral-direction metrics (e.g.
// Pass Rate) are treated like good_for_team, so offense high=green/low=red and the
// defense column mirrors via the same lens. Middle-of-pack / unknown = no color.
const PCT_EDGE = 10; // colour the top & bottom 10% (tunable)
export function cellColor(
  higherIs: string,
  side: "off" | "def" | null,
  pctile: number | null,
): Quality {
  if (pctile == null || side == null) return "neutral";
  const pos = pctile >= 100 - PCT_EDGE ? "high" : pctile <= PCT_EDGE ? "low" : null;
  if (pos == null) return "neutral";
  const eff = higherIs === "neutral" ? "good_for_team" : higherIs;
  const favorableWhenHigh =
    (side === "off" && eff === "good_for_team") || (side === "def" && eff === "bad_for_team");
  return (pos === "high") === favorableWhenHigh ? "good" : "bad";
}
