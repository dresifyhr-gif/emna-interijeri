import type { Metadata } from "next";

/**
 * The customer's quote page (/ponuda/<token>): never indexed, and the token in the URL is never
 * sent on as a referrer.
 */
export const metadata: Metadata = {
  title: "Ponuda",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "no-referrer",
};

export default function QuotePublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100svh] bg-ink font-sans text-fg">{children}</div>;
}
