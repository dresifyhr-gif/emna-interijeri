"use client";

import { cx } from "@/components/admin/ui";
import { passwordStrength, type StrengthLevel } from "@/lib/auth/strength";

const BAR: Record<StrengthLevel, string> = {
  0: "bg-white/10",
  1: "bg-rose-300",
  2: "bg-amber-300",
  3: "bg-accent",
  4: "bg-emerald-300",
};

/** live strength hint under a new-password field (advice only; the server enforces the rules) */
export function StrengthMeter({ password, username = "", id }: { password: string; username?: string; id?: string }) {
  if (!password) return null;
  const s = passwordStrength(password, username);
  return (
    <div className="space-y-2" aria-live="polite" id={id}>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx("h-1 flex-1 rounded-full transition-colors duration-300", s.level >= i ? BAR[s.level] : "bg-white/10")}
          />
        ))}
      </div>
      <p className="text-[12.5px] leading-snug text-mut">
        <span className="font-medium text-fg/85">Jačina: {s.label}.</span> {s.hint}
      </p>
    </div>
  );
}
