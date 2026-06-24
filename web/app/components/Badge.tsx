import { tailGoodness, goodnessLabel } from "@/lib/format";

export function TailBadge({
  higherIs,
  tailSide,
  isTail,
}: {
  higherIs: string | null;
  tailSide: "high" | "low" | null;
  isTail: boolean;
}) {
  if (!isTail) return null;
  const g = tailGoodness(higherIs, tailSide);
  const cls =
    g === "good"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : g === "bad"
        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
        : "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {goodnessLabel(g, tailSide)}
    </span>
  );
}

export function zClass(z: number | null): string {
  if (z === null) return "text-slate-500";
  const a = Math.abs(z);
  if (a >= 2) return z > 0 ? "text-emerald-300" : "text-rose-300";
  if (a >= 1.5) return z > 0 ? "text-emerald-400/80" : "text-rose-400/80";
  return "text-slate-300";
}

export function fmtZ(z: number | null): string {
  if (z === null) return "—";
  return (z > 0 ? "+" : "") + z.toFixed(2);
}
