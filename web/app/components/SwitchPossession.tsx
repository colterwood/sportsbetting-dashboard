"use client";

import { useRouter } from "next/navigation";

export default function SwitchPossession({
  current,
}: {
  current: { a: string; b: string; season: string; situation: string; ball: string };
}) {
  const router = useRouter();
  function toggle() {
    const ball = current.ball === "b" ? "a" : "b";
    router.push(
      `/?${new URLSearchParams({
        a: current.a,
        b: current.b,
        season: current.season,
        situation: current.situation,
        ball,
      })}`,
    );
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
