"use client";

// Catches errors thrown by the ROOT layout itself (e.g. getLeagues() when the DB is
// unreachable) — error.tsx can't, since it renders inside the layout. Must ship its
// own <html>/<body> because it replaces the root layout when active.
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0b1120",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>The dashboard is temporarily unavailable</h2>
          <p style={{ marginTop: 6, fontSize: 14, color: "#94a3b8" }}>
            Couldn’t reach the data service. Please try again in a moment.
          </p>
          <button
            onClick={() => (typeof unstable_retry === "function" ? unstable_retry() : window.location.reload())}
            style={{
              marginTop: 16,
              borderRadius: 6,
              border: "none",
              background: "#0284c7",
              color: "#fff",
              padding: "6px 16px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
