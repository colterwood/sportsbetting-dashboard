import Link from "next/link";
import type { TeamRow } from "@/lib/queries";
import { formatValue, teamHref, numerLabel, formatNumer } from "@/lib/format";
import { TailBadge, zClass, fmtZ } from "./Badge";

export default function TailTable({
  teams,
  unit,
  higherIs,
  league,
  season,
}: {
  teams: TeamRow[];
  unit: string;
  higherIs: string;
  league: string;
  season: number;
}) {
  const tails = teams
    .filter((t) => t.is_tail)
    .sort((a, b) => (b.zscore ?? 0) - (a.zscore ?? 0));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-200">
          Outliers <span className="font-normal text-slate-500">· {tails.length} in the tails</span>
        </h2>
        {tails.length === 0 ? (
          <p className="rounded-lg border border-slate-800 px-3 py-4 text-sm text-slate-500">
            No teams beyond ±1.5σ for this metric &amp; situation.
          </p>
        ) : (
          <Rows rows={tails} unit={unit} higherIs={higherIs} league={league} season={season} />
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-slate-100">
          Full ranking ({teams.length} teams)
        </summary>
        <div className="mt-2">
          <Rows rows={teams} unit={unit} higherIs={higherIs} league={league} season={season} />
        </div>
      </details>
    </div>
  );
}

function Rows({
  rows,
  unit,
  higherIs,
  league,
  season,
}: {
  rows: TeamRow[];
  unit: string;
  higherIs: string;
  league: string;
  season: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Team</th>
            <th className="px-2 py-2 text-right font-medium">Value</th>
            <th className="px-2 py-2 text-right font-medium">{numerLabel(unit)}</th>
            <th className="px-2 py-2 text-right font-medium">z</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">N</th>
            <th className="px-2 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((t) => (
            <tr key={t.team} className={t.is_tail ? "bg-slate-800/30" : undefined}>
              <td className="px-2 py-1.5 tabular-nums text-slate-500">{t.rank ?? "—"}</td>
              <td className="px-2 py-1.5">
                <Link href={teamHref(league, season, t.team)} className="text-slate-100 hover:text-sky-400">
                  {t.team}
                </Link>
                {t.low_sample && <span className="ml-1 text-[10px] text-amber-500/80">low n</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-200">{formatValue(unit, t.value)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{formatNumer(t.numerator)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${zClass(t.zscore)}`}>{fmtZ(t.zscore)}</td>
              <td className="hidden px-2 py-1.5 text-right tabular-nums text-slate-500 sm:table-cell">
                {t.sample_size}
              </td>
              <td className="px-2 py-1.5 text-right">
                <TailBadge higherIs={higherIs} tailSide={t.tail_side} isTail={t.is_tail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
