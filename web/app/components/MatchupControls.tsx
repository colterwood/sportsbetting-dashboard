"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { shortSituation } from "@/lib/matchup";

type Opt = { value: string; label: string };

export default function MatchupControls({
  seasons,
  situations,
  teams,
  current,
}: {
  seasons: Opt[];
  situations: Opt[];
  teams: string[];
  current: { season: string; situation: string; a: string; b: string };
}) {
  const router = useRouter();
  const [a, setA] = useState(current.a);
  const [b, setB] = useState(current.b);
  const [season, setSeason] = useState(current.season);
  const [situation, setSituation] = useState(current.situation);

  const loaded = Boolean(current.a && current.b);
  const nav = (p: { a: string; b: string; season: string; situation: string }) =>
    router.push(`/?${new URLSearchParams(p)}`);

  function pickSit(v: string) {
    setSituation(v);
    if (loaded) nav({ a: current.a, b: current.b, season, situation: v });
  }
  function pickSeason(v: string) {
    setSeason(v);
    if (loaded) nav({ a: current.a, b: current.b, season: v, situation });
  }
  function go() {
    if (a && b) nav({ a, b, season, situation });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {situations.map((s) => {
          const on = s.value === situation;
          return (
            <button
              key={s.value}
              onClick={() => pickSit(s.value)}
              className={
                on
                  ? "rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
              }
            >
              {shortSituation(s.value)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input list="teamlist" value={a} onChange={(e) => setA(e.target.value)} placeholder="Team A" className={inp} />
        <span className="text-slate-500">vs</span>
        <input list="teamlist" value={b} onChange={(e) => setB(e.target.value)} placeholder="Team B" className={inp} />
        <button
          onClick={go}
          disabled={!a || !b}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Go
        </button>
        {(current.a || current.b) && (
          <button onClick={() => router.push("/")} className="text-xs text-slate-400 hover:text-slate-200">
            clear
          </button>
        )}
        <select value={season} onChange={(e) => pickSeason(e.target.value)} className={`${inp} ml-auto`}>
          {seasons.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <datalist id="teamlist">
        {teams.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

const inp =
  "w-32 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500 sm:w-44";
