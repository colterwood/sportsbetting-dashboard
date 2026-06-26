import { redirect } from "next/navigation";

// The late-game totals tool now lives under the NCAAB league (Live / Upcoming via
// the league pills). Keep this path working for old links.
export default function TotalsRedirect() {
  redirect("/upcoming?league=ncaam");
}
