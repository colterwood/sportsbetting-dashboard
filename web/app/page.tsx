import Link from "next/link";
import { Suspense } from "react";
import { getLeagues } from "@/lib/queries";
import { pick } from "@/lib/format";
import MatchupPanel from "./components/MatchupPanel";
import LateGameTotals from "./components/LateGameTotals";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const leagues = await getLeagues();
  if (leagues.length === 0)
    return <Empty msg="No active leagues yet — run the analytics pipeline." />;
  const league = pick(q("league"), leagues.map((l) => l.league_id), leagues[0].league_id);
  const sport = leagues.find((l) => l.league_id === league)!.sport_id;

  if (sport === "basketball")
    return (
      <Suspense fallback={<Loading />}>
        <LateGameTotals sp={sp} />
      </Suspense>
    );

  return (
    <MatchupPanel
      league={league}
      sp={sp}
      emptyHint={
        <p className="text-sm text-slate-400">
          Pick two teams above, or browse{" "}
          <Link href="/upcoming" className="text-sky-400 hover:text-sky-300">Upcoming</Link>
          {" / "}
          <Link href="/live" className="text-sky-400 hover:text-sky-300">Live</Link>
          {" "}games.
        </p>
      }
    />
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-400">
      {msg}
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
      Loading late-game tool…
    </div>
  );
}
