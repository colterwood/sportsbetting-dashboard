import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authToken, AUTH_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/") || "/";
  const expected = process.env.SITE_PASSWORD ?? "";
  if (expected && pw === expected) {
    (await cookies()).set(AUTH_COOKIE, await authToken(expected), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    redirect(from.startsWith("/") ? from : "/");
  }
  redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
  return (
    <div className="mx-auto mt-20 max-w-xs">
      <form action={login} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-base font-semibold text-slate-100">
          D<span className="text-sky-400">+</span> Dashboard
        </div>
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
        />
        <input type="hidden" name="from" value={from ?? "/"} />
        {error && <p className="text-xs text-rose-400">Incorrect password.</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
