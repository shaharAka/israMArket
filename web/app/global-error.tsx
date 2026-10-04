"use client";

/**
 * The last resort, when even the root layout fails: it replaces the whole document, so it
 * carries its own <html> and plain inline styles (the app's stylesheet may be what failed).
 * Hebrew, right to left, and a way to try again or go home.
 */

const INK = "#14203a";
const INK_SOFT = "#4b5670";
const PRIMARY = "#2853c7";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <title>לא הצלחנו לטעון את האתר · ישראמארקט</title>
        <meta name="robots" content="noindex" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#ffffff",
          color: INK,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "26rem", padding: "32px 20px" }}>
          <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.2 }}>לא הצלחנו לטעון את האתר</h1>
          <p style={{ margin: "12px 0 0", fontSize: "17px", lineHeight: 1.7, color: INK_SOFT }}>
            כנראה תקלה רגעית. נסו שוב בעוד רגע.
          </p>
          <p style={{ margin: "28px 0 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: "50px",
                padding: "0 24px",
                border: 0,
                borderRadius: "12px",
                background: PRIMARY,
                color: "#ffffff",
                font: "inherit",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              לנסות שוב
            </button>
            {/* A full page load on purpose: the app around this page is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: PRIMARY, fontSize: "15px", fontWeight: 600 }}>
              לעמוד הראשי
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
