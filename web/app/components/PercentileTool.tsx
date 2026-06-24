"use client";

import { useState } from "react";
import type { HistBin } from "@/lib/queries";

// Type a line/value -> where it falls on the curve + implied fair odds.
// Pure client math over the already-loaded histogram. No odds API.
export default function PercentileTool({
  histogram,
  unit,
}: {
  histogram: HistBin[];
  unit: string;
}) {
  const [raw, setRaw] = useState("");
  const total = histogram.reduce((s, b) => s + b.count, 0) || 1;
  const x = parseInput(raw, unit);
  const r = x == null ? null : compute(histogram, total, x);

  const hint =
    unit === "rate" ? "e.g. 45  (=45%)" : unit === "seconds" ? "e.g. 28  (sec)" : "e.g. 2.4";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Where does a line fall?</span>
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode="decimal"
            placeholder={hint}
            className="w-28 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
        </label>
        {r && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
            <span className="text-slate-300">
              <span className="text-slate-500">pctile</span> {r.pctile.toFixed(0)}
            </span>
            <span className="text-emerald-300">
              over {Math.round(r.pOver * 100)}% <span className="text-slate-500">({odds(r.pOver)})</span>
            </span>
            <span className="text-sky-300">
              under {Math.round(r.pUnder * 100)}% <span className="text-slate-500">({odds(r.pUnder)})</span>
            </span>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Empirical, from the cross-team curve — a fair-odds reference, not a model price.
      </p>
    </div>
  );
}

function parseInput(raw: string, unit: string): number | null {
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return null;
  return unit === "rate" ? v / 100 : v;
}

function compute(histogram: HistBin[], total: number, x: number) {
  let below = 0;
  for (const b of histogram) {
    if (x >= b.hi) below += b.count;
    else if (x > b.lo) below += b.count * ((x - b.lo) / (b.hi - b.lo));
  }
  const pUnder = Math.min(1, Math.max(0, below / total));
  return { pctile: pUnder * 100, pUnder, pOver: 1 - pUnder };
}

function odds(p: number): string {
  if (p <= 0.001) return "—";
  if (p >= 0.999) return "—";
  const a = p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return a > 0 ? `+${a}` : `${a}`;
}
