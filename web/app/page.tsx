import Link from "next/link";
import { getLeagues } from "@/lib/queries";
import MatchupPanel from "./components/MatchupPanel";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const leagues = await getLeagues();
  if (leagues.length === 0)
    return <Empty msg="No active leagues yet — run the analytics pipeline." />;

  return (
    <MatchupPanel
      league={leagues[0].league_id}
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
