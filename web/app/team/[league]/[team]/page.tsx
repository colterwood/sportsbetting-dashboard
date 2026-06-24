import Link from "next/link";
import { getTeamProfile, getTeamSeasons, type ProfileRow } from "@/lib/queries";
import { formatValue, pick } from "@/lib/format";
import { TailBadge, zClass, fmtZ } from "@/app/components/Badge";

export const dynamic = "force-dynamic";

type Params = Promise<{ league: string; team: string }>;
type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { league, team: teamEnc } = await params;
  const team = decodeURIComponent(teamEnc);
  const sp = await searchParams;
  const seasonRaw = sp.season;
  const seasonParam = Array.isArray(seasonRaw) ? seasonRaw[0] : seasonRaw;

  const seasons = await getTeamSeasons(league, team);
  if (seasons.length === 0) {
    return (
      <div className="space-y-3">
        <Link href="/" className="text-sm text-sky-400 hover:underline">← Explorer</Link>
        <p className="text-slate-400">No data for {team}.</p>
      </div>
    );
  }
  const season = Number(pick(seasonParam, seasons.map(String), String(seasons[0])));
  const rows = await getTeamProfile(league, team, season);
  const tails = rows.filter((r) => r.is_tail);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-sky-400 hover:underline">← Explorer</Link>
        <h1 className="mt-1 text-xl font-bold text-slate-100">{team}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
          {seasons.map((s) => (
            <Link
              key={s}
              href={`/team/${encodeURIComponent(league)}/${encodeURIComponent(team)}?season=${s}`}
              className={
                s === season
                  ? "rounded bg-sky-500/20 px-2 py-0.5 font-medium text-sky-300"
                  : "rounded px-2 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-200">
          Biggest edges <span className="font-normal text-slate-500">· {tails.length} outlier signals</span>
        </h2>
        {tails.length === 0 ? (
          <p className="rounded-lg border border-slate-800 px-3 py-4 text-sm text-slate-500">
            No standout outliers (±1.5σ) for {team} in {season}.
          </p>
        ) : (
          <ProfileTable rows={tails} />
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-slate-100">
          All metrics ({rows.length})
        </summary>
        <div className="mt-2">
          <ProfileTable rows={rows} />
        </div>
      </details>
    </div>
  );
}

function ProfileTable({ rows }: { rows: ProfileRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Metric</th>
            <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">When</th>
            <th className="px-2 py-2 text-right font-medium">Value</th>
            <th className="px-2 py-2 text-right font-medium">Rank</th>
            <th className="px-2 py-2 text-right font-medium">z</th>
            <th className="px-2 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={`${r.metric_id}:${r.situation_key}`} className={r.is_tail ? "bg-slate-800/30" : undefined}>
              <td className="px-2 py-1.5 text-slate-200">
                {r.display_name}
                <span className="text-slate-500 sm:hidden"> · {r.situation_name}</span>
              </td>
              <td className="hidden px-2 py-1.5 text-slate-400 sm:table-cell">{r.situation_name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-200">{formatValue(r.unit, r.value)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                {r.rank != null && r.league_n != null ? `${r.rank}/${r.league_n}` : "—"}
              </td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${zClass(r.zscore)}`}>{fmtZ(r.zscore)}</td>
              <td className="px-2 py-1.5 text-right">
                <TailBadge higherIs={r.higher_is} tailSide={r.tail_side} isTail={r.is_tail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
