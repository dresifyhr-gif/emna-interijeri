import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

/**
 * Two faces, one family — clean, upright print letters everywhere (site, 3D studio, quote page, admin):
 * Inter Tight for every heading, number and title (Tailwind `font-head`, and `font-display` / `.display`, which now
 * point at it too), Inter for text. Inter Tight is the display-size cut of Inter — the same letterforms, spaced for
 * large sizes — with full latin-ext (č ć đ š ž). Variable weight. (The kitchen PDF embeds its own fonts, lib/pdf.)
 */
const head = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  variable: "--font-head",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} · Kuhinje i namještaj po mjeri`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: `${site.name} · Kuhinje i namještaj po mjeri`,
    description: site.description,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
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
