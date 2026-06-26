// Shared-password gate. The cookie stores a hash of SITE_PASSWORD (not the raw
// password); middleware (Edge) and the login server action (Node) both recompute it
// with the Web Crypto API, which exists in both runtimes. The gate is OPT-IN: it only
// engages when SITE_PASSWORD is set (so local dev stays open; Vercel turns it on).

export const AUTH_COOKIE = "dplus_auth";
const SALT = "dplus.v1";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}::${SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
