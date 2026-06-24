import type { MatchupRow } from "@/lib/queries";
import {
  familyOf,
  sideOf,
  shortLabel,
  matchupEdge,
  driverTier,
  overallTier,
  TIER_DOT,
  type Tier,
} from "@/lib/matchup";
import { formatValue } from "@/lib/format";
import { fmtZ, zClass } from "./Badge";

type Item = { family: string; label: string; off: MatchupRow | null; def: MatchupRow | null; edge: number };

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
  const get = (t: string, f: string, s: "off" | "def") => idx.get(`${t}|${f}|${s}`) ?? null;

  const build = (off: string, def: string): Item[] =>
    families
      .map((f) => {
        const o = get(off, f, "off");
        const d = get(def, f, "def");
        return {
          family: f,
          label: shortLabel(f),
          off: o,
          def: d,
          edge: o && d ? matchupEdge(o.higher_is, o.zscore, d.higher_is, d.zscore) : 0,
        };
      })
      .filter((i) => i.off || i.def)
      .sort((a, b) => b.edge - a.edge);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Possession offense={teamA} defense={teamB} items={build(teamA, teamB)} />
      <Possession offense={teamB} defense={teamA} items={build(teamB, teamA)} />
    </div>
  );
}

function Possession({ offense, defense, items }: { offense: string; defense: string; items: Item[] }) {
  const mean = items.length ? items.reduce((s, i) => s + i.edge, 0) / items.length : 0;
  const tier = overallTier(mean);
  const top = items.slice(0, 4);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-slate-100">{offense}</span>
          <span className="text-slate-500"> ball</span>
        </div>
        <Verdict tier={tier} offense={offense} defense={defense} />
      </div>

      <ul className="space-y-2">
        {top.map((i) => (
          <li key={i.family} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TIER_DOT[driverTier(i.edge)] }} />
              <span className="text-sm text-slate-200">{i.label}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {i.off ? formatValue(i.off.unit, i.off.value) : "—"}
              <span className="text-slate-600"> vs </span>
              {i.def ? formatValue(i.def.unit, i.def.value) : "—"}
            </span>
          </li>
        ))}
      </ul>

      <details className="mt-2.5">
        <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">details</summary>
        <table className="mt-1 w-full text-xs">
          <tbody className="divide-y divide-slate-800/70">
            {items.map((i) => (
              <tr key={i.family}>
                <td className="py-1 text-slate-400">{i.label}</td>
                <td className="py-1 text-right tabular-nums text-slate-300">
                  {i.off ? formatValue(i.off.unit, i.off.value) : "—"}{" "}
                  <span className={zClass(i.off?.zscore ?? null)}>{fmtZ(i.off?.zscore ?? null)}</span>
                </td>
                <td className="py-1 text-right tabular-nums text-slate-300">
                  {i.def ? formatValue(i.def.unit, i.def.value) : "—"}{" "}
                  <span className={zClass(i.def?.zscore ?? null)}>{fmtZ(i.def?.zscore ?? null)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Verdict({ tier, offense, defense }: { tier: Tier; offense: string; defense: string }) {
  const map: Record<Tier, { t: string; cls: string }> = {
    strong: { t: "Big edge", cls: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
    lean: { t: "Edge", cls: "bg-emerald-500/10 text-emerald-300/90 border-emerald-500/25" },
    even: { t: "Even", cls: "bg-slate-700/40 text-slate-300 border-slate-600/60" },
    against: { t: `${defense} D`, cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  };
  const v = map[tier];
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${v.cls}`}>{v.t}</span>
  );
}
