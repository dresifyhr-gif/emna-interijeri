import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Pill buttons.
 *  - "ink"        primary on light: graphite pill, white text
 *  - "cream"      primary on dark: warm-white pill, charcoal text
 *  - "line"       secondary on light: hairline pill
 *  - "line-dark"  secondary on dark: hairline pill
 *  - "text"       tertiary on either: text with an arrow, colour inherited
 * The older variants (light, accent, outline, dark, outline-dark) keep their look: the 3D studio and admin use them.
 */
type Variant = "light" | "accent" | "outline" | "dark" | "outline-dark" | "ink" | "cream" | "line" | "line-dark" | "text";

const variants: Record<Variant, string> = {
  light: "bg-fg text-ink hover:bg-accent",
  accent: "bg-accent text-ink hover:bg-fg",
  outline: "border border-white/25 text-fg hover:border-accent hover:text-accent",
  dark: "bg-ink text-fg hover:bg-accent hover:text-ink",
  "outline-dark": "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-fg",
  ink: "bg-graphite text-white hover:bg-black",
  cream: "bg-fg text-night hover:bg-white",
  line: "border border-graphite/20 text-graphite hover:border-graphite",
  "line-dark": "border border-white/20 text-fg hover:border-white/60",
  text: "text-current underline-offset-[6px] hover:underline !px-1.5",
};

/** the older variants keep the studio's 13 px semibold label */
const legacy = new Set<Variant>(["light", "accent", "outline", "dark", "outline-dark"]);

const shape =
  "inline-flex items-center justify-center gap-2.5 rounded-full transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-premium disabled:pointer-events-none disabled:opacity-50";
const legacyType = "gap-2 px-6 py-3.5 text-[13px] font-semibold tracking-wide";
const siteType = "px-[22px] py-3.5 text-[14px] font-medium";

const classes = (variant: Variant) => `group ${shape} ${legacy.has(variant) ? legacyType : siteType} ${variants[variant]}`;

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5">
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
    <Link href={href} className={`${classes(variant)} ${className}`} {...rest}>
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
    <button className={`${classes(variant)} ${className}`} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}
