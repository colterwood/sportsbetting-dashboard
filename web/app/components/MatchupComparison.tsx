import type { MatchupRow } from "@/lib/queries";
import { familyOf, sideOf, familyLabel, goodRank, rankQuality } from "@/lib/matchup";
import { formatValue } from "@/lib/format";

// One possession: the offense team's offensive metrics vs the defense team's
// defensive (allowed) metrics. Each cell shows value, (made/opportunities) for
// rates, and the team's overall rank (1 = best), color-coded.
export default function MatchupComparison({
  offenseTeam,
  defenseTeam,
  rows,
  families,
}: {
  offenseTeam: string;
  defenseTeam: string;
  rows: MatchupRow[];
  families: string[];
}) {
  const idx = new Map<string, MatchupRow>();
  for (const r of rows) idx.set(`${r.team}|${familyOf(r.metric_id)}|${sideOf(r.metric_id)}`, r);
  const get = (t: string, f: string, s: "off" | "def") => idx.get(`${t}|${f}|${s}`) ?? null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Metric</th>
            <th className="px-2 py-2 text-right font-medium">Offense</th>
            <th className="px-2 py-2 text-right font-medium">Defense</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {families.map((f) => (
            <tr key={f}>
              <td className="px-2 py-1.5 text-slate-300">{familyLabel(f)}</td>
              <td className="px-2 py-1.5 text-right"><Cell row={get(offenseTeam, f, "off")} /></td>
              <td className="px-2 py-1.5 text-right"><Cell row={get(defenseTeam, f, "def")} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ row }: { row: MatchupRow | null }) {
  if (!row) return <span className="text-slate-600">—</span>;
  const isRate = row.unit === "rate";
  const gr = goodRank(row.higher_is, row.rank, row.league_n);
  const q = rankQuality(row.higher_is, gr, row.league_n);
  const rankCls = q === "good" ? "text-emerald-300" : q === "bad" ? "text-rose-300" : "text-slate-500";
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-slate-200">{formatValue(row.unit, row.value)}</span>
      {isRate && row.numerator != null && (
        <span className="text-slate-500"> ({Math.round(row.numerator)}/{row.sample_size})</span>
      )}
      {gr != null && <span className={`ml-1.5 ${rankCls}`}>#{gr}</span>}
      {row.low_sample && <span className="ml-1 text-[10px] text-amber-500/80">low&nbsp;n</span>}
    </span>
  );
}
