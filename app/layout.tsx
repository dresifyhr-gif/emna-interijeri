import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { site } from "@/lib/site";
import { SHARE_IMAGE } from "@/components/pages/meta";
import "./globals.css";

/**
 * Two faces, one family — clean, upright print letters everywhere (site, 3D studio, quote page, admin):
 * Inter Tight for every heading, number and title (Tailwind `font-head`, and `font-display` / `.display`, which now
 * point at it too), Inter for text. Inter Tight is the display-size cut of Inter — the same letterforms, spaced for
 * large sizes — with full latin-ext (č ć đ š ž). Variable weight. (The kitchen PDF embeds its own fonts, lib/pdf.)
 *
 * Preloaded is only what a first screen needs (174 KB, was 262 KB): Inter in latin + latin-ext (Croatian body text uses
 * both) and Inter Tight in latin (headlines and prices). Inter Tight's latin-ext (č ć đ š ž in a heading, 88 KB) is
 * still declared — `subsets` only picks the preloads — and loads when a heading needs it; until then those letters
 * show the size-matched Arial fallback next/font generates (adjustFontFallback, on by default), so nothing moves.
 */
const head = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-head",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

// icons: app/favicon.ico, app/icon.png and app/apple-icon.png (Next's file convention writes the <link> tags)
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} · Kuhinje i namještaj po mjeri`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: `${site.name} · Kuhinje i namještaj po mjeri`,
    description: site.description,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr" className={`${sans.variable} ${head.variable}`} data-scroll-behavior="smooth">
      {/* no background of its own: html paints the canvas — dark ink, light on the public site (globals.css, per route group) */}
      <body className="min-h-screen font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
