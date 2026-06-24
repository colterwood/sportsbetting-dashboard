"use client";

import { Fragment, useState } from "react";
import type { MatchupRow, MiniDist } from "@/lib/queries";
import { familyOf, sideOf, familyLabel, goodRank, cellColor, TOP_FAMILIES } from "@/lib/matchup";
import { formatValue } from "@/lib/format";
import { useFamilyList, setFamilyList } from "@/lib/familyPrefs";
import MiniDistribution from "./MiniDistribution";

// One possession: ball-carrying team's offense vs the opponent's defense. The set
// of rows and their order come from the user's persisted preference (see
// familyPrefs) — stable across navigation/sessions. Each row taps open to a mini
// league-distribution with each team marked, and reorders with the up/down
// controls.
export default function MatchupComparison({
  offenseTeam,
  defenseTeam,
  rows,
  dists,
}: {
  offenseTeam: string;
  defenseTeam: string;
  rows: MatchupRow[];
  dists: MiniDist[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const order = useFamilyList(TOP_FAMILIES);

  const toggle = (f: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setFamilyList(next);
  }

  const idx = new Map<string, MatchupRow>();
  for (const r of rows) idx.set(`${r.team}|${familyOf(r.metric_id)}|${sideOf(r.metric_id)}`, r);
  const get = (t: string, f: string, s: "off" | "def") => idx.get(`${t}|${f}|${s}`) ?? null;
  const distOf = new Map(dists.map((d) => [d.metric_id, d]));

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
          {order.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-500">
                No metrics selected — pick some in “Choose metrics” above.
              </td>
            </tr>
          )}
          {order.map((f, i) => {
            const off = get(offenseTeam, f, "off");
            const def = get(defenseTeam, f, "def");
            const isOpen = open.has(f);
            const offDist = off ? distOf.get(off.metric_id) : undefined;
            const defDist = def ? distOf.get(def.metric_id) : undefined;
            return (
              <Fragment key={f}>
                <tr onClick={() => toggle(f)} className="cursor-pointer hover:bg-slate-800/40">
                  <td className="px-2 py-1.5 text-slate-300">
                    <span className="flex items-center gap-1">
                      <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                          className="px-1 py-0.5 text-[11px] leading-none text-slate-500 hover:text-slate-200 disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === order.length - 1}
                          aria-label="Move down"
                          className="px-1 py-0.5 text-[11px] leading-none text-slate-500 hover:text-slate-200 disabled:opacity-20"
                        >
                          ▼
                        </button>
                      </span>
                      <span className="text-[9px] text-slate-600">{isOpen ? "▼" : "▸"}</span>
                      {familyLabel(f)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right"><Cell row={off} /></td>
                  <td className="px-2 py-1.5 text-right"><Cell row={def} /></td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-900/40">
                    <td colSpan={3} className="px-3 py-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {off && offDist ? (
                          <MiniDistribution
                            histogram={offDist.histogram}
                            mean={offDist.mean}
                            median={offDist.p50}
                            valMin={offDist.val_min}
                            valMax={offDist.val_max}
                            value={off.value}
                            unit={off.unit}
                            color="#34d399"
                            caption={`${offenseTeam} — offense`}
                          />
                        ) : (
                          <span className="text-xs text-slate-600">no distribution</span>
                        )}
                        {def && defDist ? (
                          <MiniDistribution
                            histogram={defDist.histogram}
                            mean={defDist.mean}
                            median={defDist.p50}
                            valMin={defDist.val_min}
                            valMax={defDist.val_max}
                            value={def.value}
                            unit={def.unit}
                            color="#fb7185"
                            caption={`${defenseTeam} — defense`}
                          />
                        ) : (
                          <span className="text-xs text-slate-600">no distribution</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ row }: { row: MatchupRow | null }) {
  if (!row) return <span className="text-slate-600">—</span>;
  const isRate = row.unit === "rate";
  const gr = goodRank(row.higher_is, row.rank, row.league_n);
  const q = cellColor(row.higher_is, sideOf(row.metric_id), row.pctile);
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
