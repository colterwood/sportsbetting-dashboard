import { formatValue } from "@/lib/format";

type Bin = { lo: number; hi: number; count: number };

// Tiny league-distribution histogram with the team's value marked. Pure SVG, no
// client JS. Shows the shape (normal vs tail-heavy) and where the team sits.
export default function MiniDistribution({
  histogram,
  mean,
  valMin,
  valMax,
  value,
  unit,
  color,
  caption,
}: {
  histogram: Bin[];
  mean: number;
  valMin: number;
  valMax: number;
  value: number | null;
  unit: string;
  color: string;
  caption: string;
}) {
  if (!histogram?.length || value == null) return null;
  const W = 320,
    H = 64,
    padL = 4,
    padR = 4,
    top = 8,
    base = 46;
  const lo = Math.min(valMin, value),
    hi = Math.max(valMax, value);
  const span = hi - lo || Math.abs(hi) || 1;
  const dlo = lo - span * 0.05,
    dhi = hi + span * 0.05;
  const sx = (v: number) => padL + ((v - dlo) / (dhi - dlo)) * (W - padL - padR);
  const maxC = Math.max(1, ...histogram.map((b) => b.count));
  const total = histogram.reduce((s, b) => s + b.count, 0) || 1;

  let below = 0;
  for (const b of histogram) {
    if (value >= b.hi) below += b.count;
    else if (value > b.lo) below += b.count * ((value - b.lo) / (b.hi - b.lo));
  }
  const pct = Math.round((below / total) * 100);
  const v100 = pct % 100;
  const suffix = v100 >= 11 && v100 <= 13 ? "th" : (["th", "st", "nd", "rd"][pct % 10] ?? "th");

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[10px]">
        <span className="text-slate-400">{caption}</span>
        <span className="tabular-nums" style={{ color }}>
          {formatValue(unit, value)} · {pct}
          {suffix} pct
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={caption}>
        {histogram.map((b, i) => {
          const x = sx(b.lo);
          const w = Math.max(0.5, sx(b.hi) - sx(b.lo) - 0.5);
          const h = (b.count / maxC) * (base - top);
          return <rect key={i} x={x} y={base - h} width={w} height={h} fill="#334155" opacity={0.6} />;
        })}
        {/* league average */}
        <line x1={sx(mean)} x2={sx(mean)} y1={top} y2={base} stroke="#64748b" strokeWidth={1} strokeDasharray="2 3" />
        <text x={sx(mean)} y={base + 9} fill="#64748b" fontSize={9} textAnchor="middle">avg</text>
        {/* this team */}
        <line x1={sx(value)} x2={sx(value)} y1={top - 4} y2={base} stroke={color} strokeWidth={2} />
        <circle cx={sx(value)} cy={top - 4} r={2.6} fill={color} />
      </svg>
    </div>
  );
}
