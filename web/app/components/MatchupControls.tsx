"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  function go() {
    if (!a || !b) return;
    router.push(`/?${new URLSearchParams({ a, b, season, situation })}`);
  }
  function clear() {
    setA("");
    setB("");
    router.push("/");
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Season">
          <select value={season} onChange={(e) => setSeason(e.target.value)} className={selCls}>
            {seasons.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Situation">
          <select value={situation} onChange={(e) => setSituation(e.target.value)} className={selCls}>
            {situations.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Team A (offense)">
          <input list="teamlist" value={a} onChange={(e) => setA(e.target.value)}
            placeholder="type a team…" className={selCls} />
        </Field>
        <Field label="Team B">
          <input list="teamlist" value={b} onChange={(e) => setB(e.target.value)}
            placeholder="type a team…" className={selCls} />
        </Field>
      </div>
      <datalist id="teamlist">
        {teams.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <button onClick={go} disabled={!a || !b}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
          Compare
        </button>
        {(a || b || current.a) && (
          <button onClick={clear}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

const selCls =
  "rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:border-sky-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
