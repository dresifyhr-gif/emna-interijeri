import type { Metadata, Viewport } from "next";

/**
 * Everything under /admin: never indexed, never cached by crawlers (proxy.ts adds X-Robots-Tag too).
 * The framed panel lives in (panel)/layout.tsx; login and first-run setup render bare.
 *
 * Installable as its own app ("EMNA admin", public/admin.webmanifest, scope /admin/) so the owner's phone
 * can get notifications — on iPhone only from the home screen (iOS 16.4+).
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
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "EMNA admin", statusBarStyle: "black" },
  // the dark admin icon on the home screen, not the site's light one (the favicon comes from app/favicon.ico)
  icons: { apple: "/admin-icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#060607",
  colorScheme: "dark",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100svh] bg-ink font-sans text-fg">{children}</div>;
}
