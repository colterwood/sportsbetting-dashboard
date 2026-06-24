"use client";

import { useRouter } from "next/navigation";

// The top-4 families are locked on; the rest toggle into ?families= (extras).
export default function FamilyChips({
  families,
  selectedExtras,
  current,
}: {
  families: { family: string; label: string; locked: boolean }[];
  selectedExtras: string[];
  current: { a: string; b: string; season: string; situation: string; ball: string };
}) {
  const router = useRouter();

  function toggle(fam: string) {
    const set = new Set(selectedExtras);
    if (set.has(fam)) set.delete(fam);
    else set.add(fam);
    const params: Record<string, string> = {
      a: current.a,
      b: current.b,
      season: current.season,
      situation: current.situation,
      ball: current.ball,
    };
    const ex = [...set];
    if (ex.length) params.families = ex.join(",");
    router.push(`/?${new URLSearchParams(params)}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {families.map((f) =>
        f.locked ? (
          <span
            key={f.family}
            title="Always shown"
            className="rounded-full border border-sky-600/50 bg-sky-600/20 px-2.5 py-1 text-xs text-sky-200/90"
          >
            {f.label}
          </span>
        ) : (
          <button
            key={f.family}
            onClick={() => toggle(f.family)}
            className={
              selectedExtras.includes(f.family)
                ? "rounded-full border border-sky-600 bg-sky-600/20 px-2.5 py-1 text-xs text-sky-200"
                : "rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-600"
            }
          >
            {f.label}
          </button>
        ),
      )}
    </div>
  );
}
