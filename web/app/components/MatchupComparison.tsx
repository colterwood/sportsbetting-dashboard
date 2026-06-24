import type { MatchupRow } from "@/lib/queries";
import { familyOf, sideOf, familyLabel, matchupEdge } from "@/lib/matchup";
import { formatValue } from "@/lib/format";
import { TailBadge, zClass, fmtZ } from "./Badge";

// Off-vs-def matchup: each selected family pits one team's offense against the
// other's defense, with a combined "edge" (positive = offense favored).
export default function MatchupComparison({
  rows,
  teamA,
  teamB,
  families,
}: {
  rows: MatchupRow[];
  teamA: string;
  teamB: string;
  families: string[];
}) {
  const idx = new Map<string, MatchupRow>();
  for (const r of rows) idx.set(`${r.team}|${familyOf(r.metric_id)}|${sideOf(r.metric_id)}`, r);
  const get = (team: string, fam: string, side: "off" | "def") =>
    idx.get(`${team}|${fam}|${side}`) ?? null;

  const pairs = families.map((fam) => {
    const aOff = get(teamA, fam, "off");
    const bDef = get(teamB, fam, "def");
    const bOff = get(teamB, fam, "off");
    const aDef = get(teamA, fam, "def");
    return {
      fam,
      label: familyLabel(fam),
      aOff,
      bDef,
      bOff,
      aDef,
      edgeA: aOff && bDef ? matchupEdge(aOff.higher_is, aOff.zscore, bDef.higher_is, bDef.zscore) : 0,
      edgeB: bOff && aDef ? matchupEdge(bOff.higher_is, bOff.zscore, aDef.higher_is, aDef.zscore) : 0,
    };
  });

  return (
    <div className="space-y-5">
      <Side
        title={
          <>
            <span className="text-slate-100">{teamA}</span> offense vs{" "}
            <span className="text-slate-100">{teamB}</span> defense
          </>
        }
        rows={pairs.map((p) => ({ label: p.label, off: p.aOff, def: p.bDef, edge: p.edgeA }))}
      />
      <Side
        title={
          <>
            <span className="text-slate-100">{teamB}</span> offense vs{" "}
            <span className="text-slate-100">{teamA}</span> defense
          </>
        }
        rows={pairs.map((p) => ({ label: p.label, off: p.bOff, def: p.aDef, edge: p.edgeB }))}
      />
    </div>
  );
}

type SideRow = { label: string; off: MatchupRow | null; def: MatchupRow | null; edge: number };

function Side({ title, rows }: { title: React.ReactNode; rows: SideRow[] }) {
  const shown = rows.filter((r) => r.off || r.def).sort((x, y) => y.edge - x.edge);
  if (shown.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Metric</th>
              <th className="px-2 py-2 text-right font-medium">Offense</th>
              <th className="px-2 py-2 text-right font-medium">Def allowed</th>
              <th className="px-2 py-2 text-right font-medium">Edge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {shown.map((r) => (
              <tr key={r.label}>
                <td className="px-2 py-1.5 text-slate-300">{r.label}</td>
                <td className="px-2 py-1.5 text-right"><Cell row={r.off} /></td>
                <td className="px-2 py-1.5 text-right"><Cell row={r.def} /></td>
                <td className="px-2 py-1.5 text-right"><EdgeChip v={r.edge} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ row }: { row: MatchupRow | null }) {
  if (!row) return <span className="text-slate-600">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
      <span className="text-slate-200">{formatValue(row.unit, row.value)}</span>
      <span className={`text-xs ${zClass(row.zscore)}`}>{fmtZ(row.zscore)}</span>
      <TailBadge higherIs={row.higher_is} tailSide={row.tail_side} isTail={row.is_tail} />
      {row.low_sample && <span className="text-[10px] text-amber-500/80">low&nbsp;n</span>}
    </span>
  );
}

// Combined edge: positive = the offense is favored in this matchup.
function EdgeChip({ v }: { v: number }) {
  const a = Math.abs(v);
  const tier = a >= 2 ? "strong" : a >= 1 ? "lean" : "even";
  const cls =
    tier === "even"
      ? "border-transparent text-slate-500"
      : v > 0
        ? tier === "strong"
          ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/90"
        : tier === "strong"
          ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
          : "border-rose-500/20 bg-rose-500/10 text-rose-300/80";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs tabular-nums ${cls}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}
    </span>
  );
}
