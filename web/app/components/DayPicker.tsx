"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Day selector for browsing a date's slate (basketball plays daily, so this is the
// per-day analogue of the football WeekPicker). Sets ?date=YYYY-MM-DD while
// preserving any in-progress matchup/state params.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

export default function DayPicker({
  dates,
  current,
}: {
  dates: { game_date: string; games: number }[];
  current: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (dates.length === 0) return null;
  function go(date: string) {
    const sp = new URLSearchParams(params.toString());
    if (date) sp.set("date", date);
    else sp.delete("date");
    router.push(`${pathname}?${sp.toString()}`);
  }
  return (
    <select
      value={current ?? ""}
      onChange={(e) => go(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
    >
      <option value="">Browse a date…</option>
      {dates.map((d) => (
        <option key={d.game_date} value={d.game_date}>
          {label(d.game_date)} · {d.games} games
        </option>
      ))}
    </select>
  );
}
