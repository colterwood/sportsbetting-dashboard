"use client";

// Route-segment error boundary. Server components here read Postgres directly, so a
// slow/unavailable DB used to throw and take down the whole render (the prod logs
// showed "Node.js process exited"). This turns that into a friendly, retryable UI
// instead of a 500. (Next 16 passes `unstable_retry`; we fall back to a reload.)
import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
      <h2 className="text-base font-semibold text-slate-100">Couldn’t load this view</h2>
      <p className="mt-1.5 text-sm text-slate-400">
        The data service was slow or temporarily unavailable. This usually clears up on a retry.
      </p>
      <button
        onClick={() => (typeof unstable_retry === "function" ? unstable_retry() : window.location.reload())}
        className="mt-4 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
      >
        Try again
      </button>
    </div>
  );
}
