// Display helpers shared across screens.

export type Goodness = "good" | "bad" | "neutral";

export function formatValue(unit: string | null, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  switch (unit) {
    case "rate":
      return (v * 100).toFixed(1) + "%";
    case "seconds":
      return v.toFixed(1) + "s";
    case "per_drive":
    case "points":
      return v.toFixed(2);
    case "plays":
    case "yards":
      return v.toFixed(1);
    default:
      return v.toFixed(3);
  }
}

export function formatPctile(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return Math.round(p) + (p >= 100 ? "th" : ordinalSuffix(Math.round(p)));
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Is an outlier (tail) good or bad FOR THIS TEAM, given the metric's polarity?
export function tailGoodness(
  higherIs: string | null,
  tailSide: "high" | "low" | null,
): Goodness {
  if (!tailSide || !higherIs || higherIs === "neutral") return "neutral";
  if (higherIs === "good_for_team") return tailSide === "high" ? "good" : "bad";
  if (higherIs === "bad_for_team") return tailSide === "high" ? "bad" : "good";
  return "neutral";
}

// One-word label for a flagged team given its goodness.
export function goodnessLabel(g: Goodness, tailSide: "high" | "low" | null): string {
  if (g === "good") return "Edge ↑";
  if (g === "bad") return "Fade ↓";
  return tailSide === "high" ? "High outlier" : "Low outlier";
}

export function teamHref(league: string, season: number, team: string): string {
  return `/team/${encodeURIComponent(league)}/${encodeURIComponent(team)}?season=${season}`;
}

// Validate a search-param value against the allowed set, else fall back.
export function pick(value: string | undefined, allowed: string[], fallback: string): string {
  return value && allowed.includes(value) ? value : fallback;
}

// Header label for the metric's numerator (the "successes"/total behind the rate).
export function numerLabel(unit: string | null): string {
  switch (unit) {
    case "rate":
      return "Made";
    case "per_drive":
    case "points":
      return "Pts";
    case "seconds":
      return "Secs";
    case "plays":
      return "Plays";
    case "yards":
      return "Yds";
    default:
      return "Num";
  }
}

export function formatNumer(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString();
}
