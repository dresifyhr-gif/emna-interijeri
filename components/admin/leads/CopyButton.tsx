"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/admin/ui";
import { IconCheck, IconCopy } from "./icons";

/** small icon button that copies `value`; announces "Kopirano" to screen readers */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          /* clipboard blocked (http, permissions) — nothing to do */
        }
      }}
      title={copied ? "Kopirano" : `Kopiraj ${label}`}
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-mut transition-colors hover:bg-white/[0.06] hover:text-fg",
        copied && "text-emerald-200",
        className,
      )}
    >
      {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
      <span className="sr-only">{copied ? `${label} kopiran` : `Kopiraj ${label}`}</span>
    </button>
  );
}
