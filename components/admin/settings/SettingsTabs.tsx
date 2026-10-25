"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/admin/ui";

const TABS = [
  { href: "/admin/postavke", label: "Podaci o tvrtki" },
  { href: "/admin/postavke/ponude", label: "Ponude" },
  { href: "/admin/postavke/korisnici", label: "Korisnici" },
];

/** sub-navigation of /admin/postavke (links, so every section has its own URL) */
export function SettingsTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Postavke" className="-mx-4 mb-8 overflow-x-auto border-b border-white/[0.07] px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-6">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative inline-flex h-11 items-center whitespace-nowrap text-[13.5px] font-medium outline-none transition-colors duration-200",
                  "focus-visible:text-accent",
                  active ? "text-fg" : "text-fg/55 hover:text-fg",
                )}
              >
                {t.label}
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-0 -bottom-px h-[2px] rounded-full transition-colors duration-200",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
