import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { getLeagues } from "@/lib/queries";
import LeaguePills from "./components/LeaguePills";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "D+ Dashboard",
  description: "Cross-team betting outlier finder",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const leagues = await getLeagues();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-5">
              <Link href="/" className="font-semibold tracking-tight text-slate-100">
                D<span className="text-sky-400">+</span> Dashboard
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/live" className="text-slate-300 hover:text-slate-100">Live</Link>
                <Link href="/upcoming" className="text-slate-300 hover:text-slate-100">Upcoming</Link>
                <Link href="/explore" className="text-slate-300 hover:text-slate-100">Ranks</Link>
              </nav>
            </div>
          </div>
        </header>
        {leagues.length > 0 && (
          <div className="border-b border-slate-800/60 bg-slate-950/40">
            <div className="mx-auto max-w-5xl px-4 py-2">
              <Suspense fallback={null}>
                <LeaguePills leagues={leagues} defaultLeague={leagues[0].league_id} />
              </Suspense>
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
