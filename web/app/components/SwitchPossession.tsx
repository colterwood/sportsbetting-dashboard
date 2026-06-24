"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function SwitchPossession({
  current,
}: {
  current: { a: string; b: string; season: string; situation: string; ball: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function toggle() {
    const sp = new URLSearchParams(params.toString());
    sp.set("ball", current.ball === "b" ? "a" : "b");
    router.push(`${pathname}?${sp.toString()}`);
  }
  return (
    <button
      onClick={toggle}
      className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
      title="Switch which team has the ball"
    >
      ⇄ switch
    </button>
  );
}
