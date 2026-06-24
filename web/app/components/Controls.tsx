"use client";

import { useRouter, usePathname } from "next/navigation";

type Opt = { value: string; label: string };

export default function Controls({
  leagues,
  seasons,
  metrics,
  situations,
  current,
}: {
  leagues: Opt[];
  seasons: Opt[];
  metrics: Opt[];
  situations: Opt[];
  current: { league: string; season: string; metric: string; situation: string };
}) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string) {
    // Changing league resets the rest so the server picks valid defaults.
    const next =
      key === "league" ? { league: value } : { ...current, [key]: value };
    router.push(`${pathname}?${new URLSearchParams(next as Record<string, string>)}`);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Select label="League" value={current.league} opts={leagues} onChange={(v) => update("league", v)} />
      <Select label="Season" value={current.season} opts={seasons} onChange={(v) => update("season", v)} />
      <Select label="Metric" value={current.metric} opts={metrics} onChange={(v) => update("metric", v)} />
      <Select label="Situation" value={current.situation} opts={situations} onChange={(v) => update("situation", v)} />
    </div>
  );
}

function Select({
  label,
  value,
  opts,
  onChange,
}: {
  label: string;
  value: string;
  opts: Opt[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
