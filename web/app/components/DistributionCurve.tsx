import type { DistRow, TeamRow } from "@/lib/queries";
import { formatValue, tailGoodness } from "@/lib/format";

// Pure server-rendered SVG: histogram of the cross-team distribution + a "rug" of
// per-team ticks, with the tails colored. No client JS; hover shows native tooltips.
export default function DistributionCurve({
  dist,
  teams,
  unit,
  higherIs,
}: {
  dist: DistRow;
  teams: TeamRow[];
  unit: string;
  higherIs: string;
}) {
  const W = 1000,
    H = 320;
  const left = 14,
    right = 14;
  const plotL = left,
    plotR = W - right,
    plotW = plotR - plotL;
  const barsTop = 22,
    barsBot = 230;
  const rugTop = 238,
    rugBot = 286;
  const axisY = 290;

  const x0 = dist.val_min,
    x1 = dist.val_max;
  const span = x1 - x0 || Math.abs(x0) || 1;
  const lo = x0 - span * 0.04,
    hi = x1 + span * 0.04;
  const sx = (v: number) => plotL + ((v - lo) / (hi - lo)) * plotW;

  const maxCount = Math.max(1, ...dist.histogram.map((b) => b.count));
  const onCurve = teams.filter((t) => !t.low_sample);
  const tails = onCurve.filter((t) => t.is_tail);
  const field = onCurve.filter((t) => !t.is_tail);

  const tailColor = (t: TeamRow) => {
    const g = tailGoodness(higherIs, t.tail_side);
    return g === "good" ? "#34d399" : g === "bad" ? "#fb7185" : "#fbbf24";
  };

  // label the single most extreme high and low tail
  const sortedByZ = [...tails].sort((a, b) => (a.zscore ?? 0) - (b.zscore ?? 0));
  const labelled = new Set<TeamRow>();
  if (sortedByZ.length) {
    labelled.add(sortedByZ[0]);
    labelled.add(sortedByZ[sortedByZ.length - 1]);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label="Cross-team distribution with outlier tails highlighted">
      {/* histogram bars */}
      {dist.histogram.map((b, i) => {
        const bx = sx(b.lo);
        const bw = Math.max(0, sx(b.hi) - sx(b.lo) - 1);
        const bh = (b.count / maxCount) * (barsBot - barsTop);
        return (
          <rect key={i} x={bx} y={barsBot - bh} width={bw} height={bh}
            fill="#334155" opacity={0.55} rx={1} />
        );
      })}

      {/* percentile + mean guide lines */}
      {[
        { v: dist.p10, label: "p10", c: "#475569" },
        { v: dist.p90, label: "p90", c: "#475569" },
        { v: dist.mean, label: "avg", c: "#94a3b8" },
      ].map((g, i) => (
        <g key={i}>
          <line x1={sx(g.v)} x2={sx(g.v)} y1={barsTop} y2={rugBot}
            stroke={g.c} strokeWidth={1} strokeDasharray="3 4" />
          <text x={sx(g.v)} y={barsTop - 6} fill={g.c} fontSize={12} textAnchor="middle">
            {g.label}
          </text>
        </g>
      ))}

      {/* rug: field teams (faint), then tails (bright, on top) */}
      {field.map((t, i) => (
        <line key={`f${i}`} x1={sx(t.value)} x2={sx(t.value)} y1={rugTop + 16} y2={rugBot}
          stroke="#64748b" strokeWidth={1} opacity={0.5}>
          <title>{`${t.team}: ${formatValue(unit, t.value)} (${Math.round(t.pctile ?? 0)}th pct)`}</title>
        </line>
      ))}
      {tails.map((t, i) => (
        <line key={`t${i}`} x1={sx(t.value)} x2={sx(t.value)} y1={rugTop} y2={rugBot}
          stroke={tailColor(t)} strokeWidth={2.5}>
          <title>{`${t.team}: ${formatValue(unit, t.value)} (z ${(t.zscore ?? 0).toFixed(2)})`}</title>
        </line>
      ))}

      {/* labels for the two most extreme tails */}
      {[...labelled].map((t, i) => {
        const x = sx(t.value);
        const anchor = x > W - 140 ? "end" : x < 140 ? "start" : "middle";
        return (
          <text key={`l${i}`} x={x} y={rugTop - 4} fill={tailColor(t)} fontSize={12}
            fontWeight={600} textAnchor={anchor}>
            {t.team.length > 20 ? t.team.slice(0, 19) + "…" : t.team}
          </text>
        );
      })}

      {/* x-axis */}
      <line x1={plotL} x2={plotR} y1={axisY} y2={axisY} stroke="#334155" strokeWidth={1} />
      {[
        { v: x0, a: "start" as const },
        { v: dist.mean, a: "middle" as const },
        { v: x1, a: "end" as const },
      ].map((tk, i) => (
        <text key={i} x={sx(tk.v)} y={axisY + 16} fill="#94a3b8" fontSize={13} textAnchor={tk.a}>
          {formatValue(unit, tk.v)}
        </text>
      ))}
    </svg>
  );
}
