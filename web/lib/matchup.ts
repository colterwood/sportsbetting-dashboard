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
