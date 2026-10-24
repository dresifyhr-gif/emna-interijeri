import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "light" | "accent" | "outline" | "dark" | "outline-dark";

const variants: Record<Variant, string> = {
  light: "bg-fg text-ink hover:bg-accent",
  accent: "bg-accent text-ink hover:bg-fg",
  outline: "border border-white/25 text-fg hover:border-accent hover:text-accent",
  dark: "bg-ink text-fg hover:bg-accent hover:text-ink",
  "outline-dark": "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-fg",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[13px] font-semibold tracking-wide transition-all duration-300 ease-premium disabled:pointer-events-none disabled:opacity-50";

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
      <path d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function LinkButton({
  href,
  variant = "light",
  arrow = false,
  children,
  className = "",
  ...rest
}: { href: string; variant?: Variant; arrow?: boolean; children: ReactNode; className?: string } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className" | "children"
>) {
  return (
    <Link href={href} className={`group ${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

export function Button({
  variant = "light",
  arrow = false,
  children,
  className = "",
  ...rest
}: { variant?: Variant; arrow?: boolean; children: ReactNode; className?: string } & ComponentProps<"button">) {
  return (
    <button className={`group ${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}
