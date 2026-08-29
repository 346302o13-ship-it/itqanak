"use client";

/**
 * Replaces the root layout when it (or a top-level error) crashes, so users get
 * a styled bilingual page instead of Next's unstyled default. Must render its
 * own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#f5f7f4",
          fontFamily: "'IBM Plex Sans Arabic','IBM Plex Sans',system-ui,sans-serif",
          color: "#0d2931",
        }}
      >
        <main style={{ maxWidth: "30rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0 }}>
            تعذر تحميل الصفحة · Something went wrong
          </h1>
          <p style={{ marginTop: "1rem", color: "#596d72" }}>
            حدث خطأ غير متوقع. حدّث الصفحة أو أعد المحاولة.
            <br />
            An unexpected error occurred. Reload the page or try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              border: 0,
              borderRadius: "0.75rem",
              background: "#086a63",
              color: "#fff",
              padding: "0.75rem 1.25rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
            type="button"
          >
            إعادة المحاولة / Retry
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "#596d72" }} dir="ltr">
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
