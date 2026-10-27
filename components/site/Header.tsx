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

  // Tone of whatever sits under the bar: full-width sections marked data-header="dark" (the homepage hero, the 3D
  // studio band, the footer) give a light-on-dark bar, everything else the light glass bar. Watched with a 1 px band at
  // the bar's middle. The first render guesses from the route (only the homepage opens on a dark hero), so the server HTML
  // already has the right colours.
  const [dark, setDark] = useState(pathname === "/");
  const [tonePath, setTonePath] = useState(pathname);
  if (tonePath !== pathname) {
    setTonePath(pathname);
    setDark(pathname === "/");
  }
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    let io: IntersectionObserver | null = null;
    const under = new Set<Element>();
    const watch = () => {
      io?.disconnect();
      under.clear();
      const targets = document.querySelectorAll<HTMLElement>('[data-header="dark"]');
      const band = Math.round((headerRef.current?.offsetHeight ?? 72) / 2);
      const h = window.innerHeight;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) under.add(e.target);
            else under.delete(e.target);
          }
          setDark(under.size > 0);
        },
        { rootMargin: `-${band}px 0px -${Math.max(0, h - band - 1)}px 0px` },
      );
      targets.forEach((t) => io?.observe(t));
    };
    watch();
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(watch, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
      io?.disconnect();
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

  // light bar whenever the menu is open (the menu itself is light)
  const onDark = dark && !open;
  const bar = open
    ? "border-b border-hairline bg-canvas text-graphite"
    : onDark
      ? scrolled
        ? // over the live 3D hero: a solid translucent fill, no backdrop blur (blurring a repainting canvas costs a full pass per frame)
          "border-b border-white/[0.06] bg-night/[0.86] text-fg"
        : "border-b border-transparent text-fg"
      : scrolled
        ? "border-b border-hairline/80 bg-canvas/[0.82] text-graphite backdrop-blur-xl backdrop-saturate-150"
        : "border-b border-transparent text-graphite";

  return (
    <>
      <header
        ref={headerRef}
        onClick={onHeaderClick}
        data-tone={onDark ? "dark" : "light"}
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color,backdrop-filter,-webkit-backdrop-filter] duration-500 ease-premium ${bar}`}
      >
        <div className="shell flex h-[72px] items-center justify-between gap-6">
          <Wordmark />

          <nav aria-label="Glavna navigacija" className="hidden items-center gap-7 lg:flex xl:gap-8">
            {nav.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative py-1 text-[13.5px] transition-opacity duration-300 hover:opacity-100 ${active ? "opacity-100" : "opacity-[0.72]"}`}
                >
                  {n.label}
                  <span
                    aria-hidden
                    className={`absolute -bottom-0.5 left-0 h-px transition-all duration-500 ease-premium ${onDark ? "bg-accent" : "bg-bronze"} ${
                      active ? "w-full" : "w-0"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {site.contact.phone && (
              <a href={telHref(site.contact.phone)} className="hidden text-[13px] opacity-70 transition-opacity hover:opacity-100 xl:block">
                {site.contact.phone}
              </a>
            )}
            <LinkButton href="/studio" variant={onDark ? "cream" : "ink"} className="hidden !px-[18px] !py-2.5 !text-[13px] sm:inline-flex">
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
              <span className={`absolute h-px w-6 bg-current transition-transform duration-300 ${open ? "rotate-45" : "-translate-y-[4px]"}`} />
              <span className={`absolute h-px w-6 bg-current transition-transform duration-300 ${open ? "-rotate-45" : "translate-y-[4px]"}`} />
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
            data-tone="light"
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-canvas pt-[96px] text-graphite lg:hidden"
          >
            <nav aria-label="Izbornik" className="shell flex flex-col">
              {menuItems.map((n, i) => {
                const active = isActive(pathname, n.href);
                return (
                  <motion.div
                    key={n.href}
                    initial={reduce ? false : { opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                    className="border-b border-hairline"
                  >
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => closeMenu()}
                      className={`heading flex items-center justify-between gap-4 py-3.5 text-[32px] leading-none transition-colors hover:text-taupe ${
                        active ? "text-graphite" : "text-graphite/85"
                      }`}
                    >
                      {n.label}
                      {active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-bronze" />}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>
            <div className="shell mt-auto space-y-4 pb-10 pt-10">
              {site.contact.phone && (
                <a href={telHref(site.contact.phone)} className="block text-[15px] text-taupe">
                  {site.contact.phone}
                </a>
              )}
              <LinkButton href="/studio" variant="ink" arrow className="w-full" onClick={() => closeMenu()}>
                Složite kuhinju u 3D studiju
              </LinkButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
