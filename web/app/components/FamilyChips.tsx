"use client";

import { TOP_FAMILIES } from "@/lib/matchup";
import { useFamilyList, setFamilyList } from "@/lib/familyPrefs";

// Pick which metric families show in the matchup table. The selection persists in
// localStorage (see familyPrefs) — stable across navigation and sessions, so once
// you choose your metrics they stay until you change them. New picks append to the
// end (then you can reorder them in the table).
export default function FamilyChips({
  families,
}: {
  families: { family: string; label: string }[];
}) {
  const selected = useFamilyList(TOP_FAMILIES);

  function toggle(fam: string) {
    if (selected.includes(fam)) setFamilyList(selected.filter((f) => f !== fam));
    else setFamilyList([...selected, fam]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {families.map((f) => {
        const on = selected.includes(f.family);
        return (
          <button
            key={f.family}
            onClick={() => toggle(f.family)}
            aria-pressed={on}
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
