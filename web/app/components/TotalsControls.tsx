"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

// Manual game-state + betting-line entry for the Late-Game Totals tool. Writes the
// state into URL params (?half&m&s&ld&by&a&b&gt&lt&tt) so the server page can read
// it and the result is shareable/bookmarkable. A future live tracker can pre-fill
// these same params from a feed instead of the user typing them.

export type TotalsState = {
  season: string;
  a: string;
  b: string;
  half: string;
  m: string;
  s: string;
  ld: string; // 'a' | 'b' — which team is leading
  by: string; // lead margin
  gt: string; // game total line
  lt: string; // leading-team total line
  tt: string; // trailing-team total line
};

export default function TotalsControls({
  seasons,
  teams,
  current,
}: {
  seasons: number[];
  teams: string[];
  current: TotalsState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [st, setSt] = useState<TotalsState>(current);
  const set = (k: keyof TotalsState, v: string) => setSt((p) => ({ ...p, [k]: v }));

  function apply() {
    const sp = new URLSearchParams(params.toString());
    // an empty team box falls back to the loaded matchup (blur-restore handles the
    // UI; this covers an Update click while a box is still cleared)
    const eff = { ...st, a: st.a.trim() || current.a, b: st.b.trim() || current.b };
    for (const [k, v] of Object.entries(eff)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  const leaderName = st.ld === "b" ? st.b || "Team B" : st.a || "Team A";
  const trailerName = st.ld === "b" ? st.a || "Team A" : st.b || "Team B";

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      {/* teams */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input list="ncaam-teams" value={st.a}
          onFocus={() => set("a", "")}
          onChange={(e) => set("a", e.target.value)}
          onBlur={() => { if (!st.a.trim()) set("a", current.a); }}
          placeholder="Team A (away)" className={inp} />
        <span className="text-slate-500">vs</span>
        <input list="ncaam-teams" value={st.b}
          onFocus={() => set("b", "")}
          onChange={(e) => set("b", e.target.value)}
          onBlur={() => { if (!st.b.trim()) set("b", current.b); }}
          placeholder="Team B (home)" className={inp} />
        <select value={st.season} onChange={(e) => set("season", e.target.value)} className={`${sel} ml-auto`}>
          {seasons.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* game state */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Seg label="Half" options={[["1", "1st"], ["2", "2nd"]]} value={st.half} onChange={(v) => set("half", v)} />
        <label className="flex items-center gap-1.5 text-slate-300">
          <span className="text-xs text-slate-400">Time left</span>
          <input type="number" min={0} max={20} value={st.m} onChange={(e) => set("m", e.target.value)} className={num} />
          <span className="text-slate-500">:</span>
          <input type="number" min={0} max={59} value={st.s} onChange={(e) => set("s", e.target.value)} className={num} />
        </label>
        <Seg label="Leading" options={[["a", "Team A"], ["b", "Team B"]]} value={st.ld} onChange={(v) => set("ld", v)} />
        <label className="flex items-center gap-1.5 text-slate-300">
          <span className="text-xs text-slate-400">by</span>
          <input type="number" min={1} max={40} value={st.by} onChange={(e) => set("by", e.target.value)} className={num} />
        </label>
      </div>

      {/* lines */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
        <Line label="Game O/U" hint="both teams, rest of half" value={st.gt} onChange={(v) => set("gt", v)} />
        <Line label={`${leaderName} O/U`} hint="leader, rest of half" value={st.lt} onChange={(v) => set("lt", v)} />
        <Line label={`${trailerName} O/U`} hint="trailer, rest of half" value={st.tt} onChange={(v) => set("tt", v)} />
        <button onClick={apply}
          className="ml-auto rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
          Update
        </button>
      </div>

      <datalist id="ncaam-teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

function Seg({ label, options, value, onChange }: {
  label: string; options: [string, string][]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex gap-1">
        {options.map(([v, lbl]) => (
          <button key={v} onClick={() => onChange(v)}
            className={v === value
              ? "rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
              : "rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function Line({ label, hint, value, onChange }: {
  label: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="truncate text-xs text-slate-400" title={hint}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" inputMode="decimal"
        className="w-28 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500" />
    </label>
  );
}

const inp = "w-32 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500 sm:w-44";
const sel = "rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500";
const num = "w-14 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-center text-slate-100 outline-none focus:border-sky-500";
