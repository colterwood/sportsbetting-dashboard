"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Week selector for the Upcoming page (NCAAF/NFL/CFL etc.). Sets ?week=N while
// preserving any open matchup (?a&b) and other params.
export default function WeekPicker({
  weeks,
  current,
}: {
  weeks: number[];
  current: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (weeks.length === 0) return null;
  function go(week: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", week);
    router.push(`${pathname}?${sp.toString()}`);
  }
  return (
    <select
      value={current ?? ""}
      onChange={(e) => go(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week {w}
        </option>
      ))}
    </select>
  );
}
