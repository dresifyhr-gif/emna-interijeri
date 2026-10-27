"use client";

/**
 * The last safety net: an error above every page (the root layout itself). It replaces the whole document, so it brings
 * its own <html lang="hr"> and <body>, and its looks inline — globals.css, the fonts and Tailwind are not there. Light and
 * warm like the public site, in Croatian, never Next's English page. "Pokušajte ponovno" fetches and renders again
 * (retry); still here a moment later, the page is reloaded.
 */
import { useEffect, useRef, type CSSProperties } from "react";

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 48,
  padding: "0 22px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    console.error(error);
    return () => {
      alive.current = false;
    };
  }, [error]);

  const again = () => {
    retry();
    window.setTimeout(() => {
      if (alive.current) window.location.reload();
    }, 3000);
  };

  return (
    <html lang="hr">
      <head>
        <title>Greška · EMNA Interijeri</title>
        <meta name="robots" content="noindex" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#FAF8F5",
          color: "#1A1A18",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <main style={{ boxSizing: "border-box", maxWidth: 720, margin: "0 auto", padding: "56px 24px 64px" }}>
          {/* plain links here: a full page load, not the app's router (it may be what failed) */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" aria-label="EMNA Interijeri — naslovnica" style={{ color: "inherit", textDecoration: "none", fontSize: 19, fontWeight: 500, letterSpacing: "0.42em" }}>
            EMNA
          </a>
          <p style={{ margin: "72px 0 0", fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6F6A62" }}>Greška</p>
          <h1 style={{ margin: "18px 0 0", fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em" }}>
            Nešto je pošlo krivo.
          </h1>
          <p style={{ margin: "24px 0 0", maxWidth: 520, fontSize: 18, lineHeight: 1.6, color: "#6F6A62" }}>
            Stranica se nije mogla prikazati. Pokušajte ponovno — a ako se greška ponovi, upit nam možete poslati preko kontakt
            stranice.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 36 }}>
            <button type="button" onClick={again} style={{ ...pill, border: 0, background: "#1A1A18", color: "#FFFFFF" }}>
              Pokušajte ponovno
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ ...pill, border: "1px solid rgba(26,26,24,.2)", color: "#1A1A18" }}>
              Naslovnica
            </a>
            <a href="/kontakt#upit" style={{ ...pill, border: "1px solid rgba(26,26,24,.2)", color: "#1A1A18" }}>
              Pošaljite upit
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
