import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MotionProvider } from "@/components/site/MotionProvider";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { LocalBusinessJsonLd } from "@/components/pages/LocalBusinessJsonLd";

/**
 * Every marketing page gets the skip link, header, footer, WhatsApp button and the
 * LocalBusiness JSON-LD (built only from known lib/site.ts facts).
 * /studio lives outside this group.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <LocalBusinessJsonLd />
      <a
        href="#sadrzaj"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-ink"
      >
        Preskoči na sadržaj
      </a>
      <Header />
      <main id="sadrzaj">{children}</main>
      <Footer />
      <WhatsAppFab />
    </MotionProvider>
  );
}
