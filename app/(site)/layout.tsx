import type { Viewport } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ContactBar } from "@/components/site/ContactBar";
import { MotionProvider } from "@/components/site/MotionProvider";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { LocalBusinessJsonLd } from "@/components/pages/LocalBusinessJsonLd";
import { getPublicCompany } from "@/lib/site-data";

/** the public site is light (warm white); the homepage overrides the colour for its dark hero */
export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  colorScheme: "light",
};

/**
 * Every marketing page gets the skip link, header, footer, the phone contact bar (WhatsApp button on wider screens)
 * and the LocalBusiness JSON-LD. The company facts in them come from getPublicCompany(): what the owner saved in
 * /admin/postavke over lib/site.ts, cached, so the pages stay static and refresh when the owner saves.
 * `.site` (globals.css) makes everything inside light by default; dark zones mark themselves data-tone="dark".
 * /studio lives outside this group.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const company = await getPublicCompany();
  const { phone, whatsapp } = company.contact;
  return (
    <MotionProvider>
      <div className="site min-h-screen font-sans">
        <LocalBusinessJsonLd company={company} />
        <a
          href="#sadrzaj"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-graphite focus:px-5 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-white"
        >
          Preskoči na sadržaj
        </a>
        <Header phone={phone} />
        <main id="sadrzaj">{children}</main>
        <Footer company={company} />
        <ContactBar phone={phone} whatsapp={whatsapp} />
        <WhatsAppFab whatsapp={whatsapp} />
      </div>
    </MotionProvider>
  );
}
