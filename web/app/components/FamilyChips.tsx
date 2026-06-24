"use client";

import { useRouter } from "next/navigation";

// Toggle which metric families show in the matchup. Selection lives in the URL
// (?families=csv) so the server re-renders the filtered comparison.
export default function FamilyChips({
  families,
  selected,
  current,
}: {
  families: { family: string; label: string }[];
  selected: string[];
  current: { a: string; b: string; season: string; situation: string };
}) {
  const router = useRouter();

  function toggle(fam: string) {
    const set = new Set(selected);
    if (set.has(fam)) set.delete(fam);
    else set.add(fam);
    const fams = [...set];
    const params: Record<string, string> = { ...current };
    // all (or none) selected -> drop the param so it defaults to all
    if (fams.length && fams.length < families.length) params.families = fams.join(",");
    router.push(`/?${new URLSearchParams(params)}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {families.map((f) => {
        const on = selected.includes(f.family);
        return (
          <button
            key={f.family}
            onClick={() => toggle(f.family)}
            className={
              on
                ? "rounded-full border border-sky-600 bg-sky-600/20 px-2.5 py-1 text-xs text-sky-200"
                : "rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-600"
            }
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
