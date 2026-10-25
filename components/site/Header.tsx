"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nav, site, telHref } from "@/lib/site";
import { usePrefersReducedMotion } from "@/components/ui/motion";
import { Wordmark } from "./Wordmark";
import { LinkButton } from "@/components/ui/Button";

const MENU_ID = "mobilni-izbornik";
const DESKTOP = "(min-width: 1024px)"; // lg: the menu and its toggle are hidden from here up
const menuItems = [{ href: "/", label: "Naslovnica" }, ...nav];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function Header() {
  const pathname = usePathname();
  const reduce = usePrefersReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // setState only when the flag flips, not on every scroll event
    let last: boolean | null = null;
    const onScroll = () => {
      const v = window.scrollY > 24;
      if (v === last) return;
      last = v;
      setScrolled(v);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Over sections marked data-header="solid" (the homepage's live 3D hero) the bar is a near-opaque fill
  // without backdrop-filter: blurring a canvas that changes every frame costs a full blur pass per frame.
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('[data-header="solid"]');
    if (!targets.length || typeof IntersectionObserver === "undefined") return;
    const under = new Set<Element>();
    // a thin band at the top of the viewport, where the bar sits
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) under.add(e.target);
          else under.delete(e.target);
        }
        setSolid(under.size > 0);
      },
      { rootMargin: "0px 0px -92% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => {
      io.disconnect();
      setSolid(false);
    };
  }, [pathname]);

  // close the mobile menu on navigation (adjusting state during render, not in an effect)
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  /** close and (unless the toggle is gone, e.g. after a resize to desktop) hand focus back to it */
  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // While open the menu is modal: page behind is inert and scroll-locked, Esc closes, focus moves in.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.style.overflow = "hidden";

    // everything except the header bar (it holds the close toggle) and the menu itself
    const keep = [headerRef.current, menuRef.current].filter((el): el is HTMLElement => el !== null);
    const inerted: HTMLElement[] = [];
    const makeInert = (parent: Element) => {
      for (const el of Array.from(parent.children)) {
        if (!(el instanceof HTMLElement) || keep.includes(el)) continue;
        if (keep.some((k) => el.contains(k))) {
          makeInert(el);
          continue;
        }
        if (el.inert || /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT|NEXT-ROUTE-ANNOUNCER)$/.test(el.tagName)) continue;
        el.inert = true;
        inerted.push(el);
      }
    };
    makeInert(document.body);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeMenu();
    };
    document.addEventListener("keydown", onKey);

    // rotating a tablet past lg hides both the overlay and its toggle: close instead of staying locked
    const desktop = window.matchMedia(DESKTOP);
    const onDesktop = () => {
      if (desktop.matches) closeMenu(false);
    };
    desktop.addEventListener("change", onDesktop);

    const focusFirst = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus());

    return () => {
      root.style.overflow = "";
      for (const el of inerted) el.inert = false;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
      cancelAnimationFrame(focusFirst);
    };
  }, [open, closeMenu]);

  // any link in the header (wordmark, 3D studio) also closes the menu, even when it points at the current page
  const onHeaderClick = (e: MouseEvent<HTMLElement>) => {
    if (open && (e.target as HTMLElement).closest("a[href]")) closeMenu(false);
  };

  const ease = [0.7, 0, 0.2, 1] as const;

  return (
    <>
      <header
        ref={headerRef}
        onClick={onHeaderClick}
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter,-webkit-backdrop-filter] duration-500 ease-premium ${
          open || (scrolled && !solid)
            ? "glass border-x-0 border-t-0"
            : scrolled
              ? "border-b border-white/10 bg-ink/[0.88]"
              : "border-b border-transparent"
        }`}
      >
        <div className="shell flex h-[72px] items-center justify-between gap-6">
          <Wordmark />

          <nav aria-label="Glavna navigacija" className="hidden items-center gap-8 lg:flex">
            {nav.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative text-[11px] font-medium uppercase tracking-[0.2em] transition-colors hover:text-fg ${
                    active ? "text-fg" : "text-fg/65"
                  }`}
                >
                  {n.label}
                  <span
                    aria-hidden
                    className={`absolute -bottom-1.5 left-0 h-px bg-accent transition-all duration-500 ease-premium ${
                      active ? "w-full" : "w-0"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {site.contact.phone && (
              <a href={telHref(site.contact.phone)} className="hidden text-[12px] text-fg/70 hover:text-fg xl:block">
                {site.contact.phone}
              </a>
            )}
            <LinkButton href="/studio" variant="accent" arrow className="hidden !px-5 !py-2.5 sm:inline-flex">
              3D studio
            </LinkButton>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => (open ? closeMenu() : setOpen(true))}
              aria-expanded={open}
              aria-controls={MENU_ID}
              aria-label={open ? "Zatvori izbornik" : "Otvori izbornik"}
              className="relative -mr-2 flex h-11 w-11 items-center justify-center lg:hidden"
            >
              <span className={`absolute h-px w-6 bg-fg transition-all duration-300 ${open ? "rotate-45" : "-translate-y-[4px]"}`} />
              <span className={`absolute h-px w-6 bg-fg transition-all duration-300 ${open ? "-rotate-45" : "translate-y-[4px]"}`} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            key="menu"
            id={MENU_ID}
            // reduced motion: a short cross-fade instead of the full-screen wipe
            initial={reduce ? { opacity: 0 } : { clipPath: "circle(0% at 100% 0%)" }}
            animate={reduce ? { opacity: 1 } : { clipPath: "circle(150% at 100% 0%)" }}
            exit={reduce ? { opacity: 0 } : { clipPath: "circle(0% at 100% 0%)" }}
            transition={reduce ? { duration: 0.15 } : { duration: 0.7, ease }}
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ink-900 pt-[96px] lg:hidden"
          >
            <nav aria-label="Izbornik" className="shell flex flex-col gap-1">
              {menuItems.map((n, i) => {
                const active = isActive(pathname, n.href);
                return (
                  <motion.div
                    key={n.href}
                    initial={reduce ? false : { opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => closeMenu()}
                      className={`display block py-1.5 text-[40px] hover:text-accent ${active ? "text-accent" : "text-fg"}`}
                    >
                      {n.label}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>
            <div className="shell mt-auto pb-10 pt-8">
              <LinkButton href="/studio" variant="accent" arrow className="w-full" onClick={() => closeMenu()}>
                Složi kuhinju u 3D studiju
              </LinkButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
