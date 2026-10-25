import type { Metadata, Viewport } from "next";

/**
 * Everything under /admin: never indexed, never cached by crawlers (proxy.ts adds X-Robots-Tag too).
 * The framed panel lives in (panel)/layout.tsx; login and first-run setup render bare.
 */
export const metadata: Metadata = {
  title: { default: "Administracija", template: "%s · Administracija · EMNA" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#060607",
  colorScheme: "dark",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100svh] bg-ink font-sans text-fg">{children}</div>;
}
