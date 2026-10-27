"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { inquiryHref, interestForPath, telHref, waHref, type InquiryInterest } from "@/lib/site";
import { WhatsAppIcon } from "./WhatsAppFab";

/**
 * sections with their own way to send an inquiry — the forms, and the homepage hero (its "Pošaljite upit", with the
 * price and finish chips along the bottom of the 3D view): the bar steps aside while one of them is on screen
 */
const FORMS = "#upit, [data-upit]";

const waText: Record<InquiryInterest, string> = {
  kuhinja: "Pozdrav, zanima me kuhinja po mjeri.",
  ormar: "Pozdrav, zanima me ormar po mjeri.",
  interijer: "Pozdrav, zanima me uređenje interijera po mjeri.",
};

/**
 * Phones only (below md): a bar fixed to the bottom of the screen with "Pošaljite upit" (the form on /kontakt, with
 * this page's interest), "Nazovite" and WhatsApp — the last two only once the owner has entered the numbers. It slides
 * in after the first ~70 % of a screen and steps aside while an inquiry form or the homepage hero is visible. The
 * footer keeps room for it at the very bottom, so nothing ends up hidden underneath and nothing moves when it appears.
 * Tablets and desktops keep the floating WhatsApp button (WhatsAppFab).
 */
export function ContactBar({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const pathname = usePathname();
  const interest = interestForPath(pathname);
  const [past, setPast] = useState(false);
  const [formInView, setFormInView] = useState(false);

  useEffect(() => {
    // setState only when the flag flips, not on every scroll event
    let last: boolean | null = null;
    const onScroll = () => {
      const v = window.scrollY > window.innerHeight * 0.7;
      if (v === last) return;
      last = v;
      setPast(v);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // the forms differ per page: forget the last page's (adjusting state during render, not in an effect) and look again
  const [formPath, setFormPath] = useState(pathname);
  if (formPath !== pathname) {
    setFormPath(pathname);
    setFormInView(false);
  }
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setFormInView(visible.size > 0);
    });
    document.querySelectorAll(FORMS).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  const show = past && !formInView;

  return (
    <div
      inert={!show}
      data-tone="light"
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-hairline/80 bg-canvas/[0.88] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-graphite backdrop-blur-xl backdrop-saturate-150 transition-transform duration-500 ease-premium motion-reduce:transition-none md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <nav aria-label="Brzi kontakt" className="mx-auto flex max-w-md items-center gap-2">
        <Link
          href={inquiryHref(interest)}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-graphite px-5 text-[14px] font-medium text-white transition-colors duration-300 hover:bg-black"
        >
          Pošaljite upit
        </Link>
        {phone && (
          <a
            href={telHref(phone)}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-graphite/20 bg-card px-5 text-[14px] font-medium text-graphite transition-colors duration-300 hover:border-graphite"
          >
            Nazovite<span className="sr-only"> {phone}</span>
          </a>
        )}
        {whatsapp && (
          <a
            href={waHref(whatsapp, waText[interest])}
            target="_blank"
            rel="noreferrer"
            aria-label="Pošaljite nam poruku na WhatsApp"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-graphite/20 bg-card text-[#128C7E] transition-colors duration-300 hover:border-graphite"
          >
            <WhatsAppIcon size={22} />
          </a>
        )}
      </nav>
    </div>
  );
}

/**
 * A link to the inquiry form with the current page's interest (/ormari → ormar …), for server components that several
 * pages share, e.g. the "Izmjera" step of ProcessSteps.
 */
export function InquiryLink({
  measurement = false,
  className = "",
  children,
}: {
  measurement?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={inquiryHref(interestForPath(pathname), { measurement })} className={className}>
      {children}
    </Link>
  );
}
