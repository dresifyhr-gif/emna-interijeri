"use client";

/**
 * Admin frame: sidebar (desktop) / drawer (phone), top bar with the user and "Odjava".
 * Rendered by app/admin/(panel)/layout.tsx after requireAdmin(); pages render inside <main>.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose, IconExternal, IconInbox, IconLogout, IconMenu, IconOverview, IconQuote, IconSettings } from "./ui/icons";
import { cx } from "./ui/cx";

export interface ShellNavBadges {
  /** number of leads with status "novi" */
  upiti?: number;
}

const NAV = [
  { href: "/admin", label: "Pregled", icon: IconOverview, exact: true },
  { href: "/admin/upiti", label: "Upiti", icon: IconInbox, badge: "upiti" as const },
  { href: "/admin/ponude", label: "Ponude", icon: IconQuote },
  { href: "/admin/postavke", label: "Postavke", icon: IconSettings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/admin" className="group inline-flex flex-col leading-none" aria-label="EMNA administracija — pregled">
      <span className="font-display text-[18px] font-medium tracking-[0.42em] text-fg transition-opacity group-hover:opacity-80">
        EMNA
      </span>
      <span className="mt-1.5 text-[8.5px] font-medium uppercase tracking-[0.42em] text-accent/90">Administracija</span>
    </Link>
  );
}

function Nav({ pathname, badges, onNavigate }: { pathname: string; badges: ShellNavBadges; onNavigate?: () => void }) {
  return (
    <nav aria-label="Administracija">
      <ul className="space-y-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const count = item.badge ? badges[item.badge] : undefined;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors duration-200",
                  active ? "bg-white/[0.06] text-fg" : "text-fg/60 hover:bg-white/[0.03] hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-y-2.5 left-0 w-[2px] rounded-full transition-colors duration-200",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
                <Icon className={cx("shrink-0 transition-colors", active ? "text-accent" : "text-fg/45 group-hover:text-fg/70")} />
                <span className="flex-1">{item.label}</span>
                {count ? (
                  <span className="min-w-[22px] rounded-full bg-accent px-1.5 py-px text-center text-[11px] font-semibold tabular-nums text-ink">
                    <span className="sr-only">novih: </span>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFoot() {
  return (
    <div className="space-y-4 border-t border-white/[0.06] pt-5">
      <a
        href="/"
        target="_blank"
        rel="noopener"
        className="group flex items-center gap-2.5 px-3 text-[12.5px] font-medium text-mut transition-colors hover:text-fg"
      >
        <IconExternal size={15} className="text-fg/40 transition-colors group-hover:text-accent" />
        Otvori stranicu
        <span className="sr-only">(nova kartica)</span>
      </a>
      {/* the "technical drawing" motif, quietly */}
      <div aria-hidden className="flex items-center gap-2 px-3 text-accent/40">
        <span className="h-2 w-px rotate-45 bg-current" />
        <span className="h-px flex-1 bg-current" />
        <span className="h-2 w-px rotate-45 bg-current" />
      </div>
    </div>
  );
}

function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/admin/odjava" method="post">
      <button
        type="submit"
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 text-[12.5px] font-semibold text-fg/80 transition-colors duration-200 hover:border-accent/60 hover:text-accent",
          compact ? "w-9 justify-center" : "px-3.5",
        )}
      >
        <IconLogout size={16} />
        <span className={compact ? "sr-only" : undefined}>Odjava</span>
      </button>
    </form>
  );
}

export function Shell({
  username,
  badges = {},
  children,
}: {
  username: string;
  badges?: ShellNavBadges;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // close the drawer whenever the route changes (adjusting state during render, not in an effect)
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const panel = drawer.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const initial = (username.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-[100svh] bg-ink lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a
        href="#admin-sadrzaj"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-ink"
      >
        Preskoči na sadržaj
      </a>

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100svh] flex-col border-r border-white/[0.06] bg-ink-900 px-4 pb-6 pt-7 lg:flex">
        <div className="px-3">
          <Brand />
        </div>
        <div className="mt-12 flex-1 overflow-y-auto">
          <p className="eyebrow mb-3 px-3 text-[10px] text-mut/80">Izbornik</p>
          <Nav pathname={pathname} badges={badges} />
        </div>
        <SidebarFoot />
      </aside>

      {/* phone / tablet drawer */}
      <div
        className={cx(
          "fixed inset-0 z-50 transition-[visibility] duration-300 motion-reduce:transition-none lg:hidden",
          open ? "visible" : "invisible",
        )}
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zatvori izbornik"
          onClick={() => setOpen(false)}
          className={cx(
            "absolute inset-0 bg-ink-900/70 backdrop-blur-sm transition-opacity duration-300 ease-premium motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={drawer}
          id="admin-izbornik"
          role="dialog"
          aria-modal="true"
          aria-label="Izbornik administracije"
          className={cx(
            "absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col border-r border-white/[0.08] bg-ink-900 px-4 pb-6 pt-5 shadow-2xl",
            "transition-transform duration-300 ease-premium motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-3">
            <Brand />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                menuButton.current?.focus();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg/70 transition-colors hover:bg-white/[0.06] hover:text-fg"
            >
              <IconClose />
              <span className="sr-only">Zatvori izbornik</span>
            </button>
          </div>
          <div className="mt-10 flex-1 overflow-y-auto">
            <Nav pathname={pathname} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
          <SidebarFoot />
        </div>
      </div>

      <div className="flex min-h-[100svh] min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink/85 backdrop-blur-xl backdrop-saturate-150">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-8 lg:px-10">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="admin-izbornik"
              className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-full text-fg/80 transition-colors hover:bg-white/[0.06] hover:text-fg lg:hidden"
            >
              <IconMenu size={20} />
              <span className="sr-only">Otvori izbornik</span>
            </button>
            <div className="lg:hidden">
              <Brand />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2.5" title={username}>
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-display text-[13px] font-medium text-accent"
                >
                  {initial}
                </span>
                <span className="hidden max-w-[160px] truncate text-[13px] text-fg/80 sm:block">
                  <span className="sr-only">Prijavljeni ste kao </span>
                  {username}
                </span>
              </div>
              <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />
              <div className="hidden sm:block">
                <LogoutButton />
              </div>
              <div className="sm:hidden">
                <LogoutButton compact />
              </div>
            </div>
          </div>
        </header>

        <main id="admin-sadrzaj" tabIndex={-1} className="flex-1 px-4 pb-16 pt-8 outline-none sm:px-8 lg:px-10 lg:pt-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
