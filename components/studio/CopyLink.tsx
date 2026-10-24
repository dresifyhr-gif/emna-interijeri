"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Kopiraj link na svoju kuhinju". `getUrl` is read at click time so the link always matches the current kitchen.
 * If copying is blocked, the link is shown selected so it can be copied by hand.
 */
export function CopyLinkButton({
  getUrl,
  label = "Kopiraj link na svoju kuhinju",
  variant = "outline",
  showField = false,
  block = false,
  className = "",
}: {
  getUrl: () => string;
  label?: string;
  variant?: "accent" | "outline" | "quiet";
  /** always show the link in a read-only field below the button */
  showField?: boolean;
  /** full-width button on phones */
  block?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function onClick() {
    const u = getUrl();
    setUrl(u);
    const ok = await copyText(u);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (ok) {
      setState("copied");
      timer.current = window.setTimeout(() => setState("idle"), 2400);
    } else {
      setState("manual");
      window.setTimeout(() => fieldRef.current?.select(), 0);
    }
  }

  const look =
    variant === "accent"
      ? "bg-accent text-ink hover:bg-fg"
      : variant === "quiet"
        ? "text-fg/80 hover:text-accent px-0"
        : "border border-white/20 text-fg hover:border-accent hover:text-accent";

  const shownUrl = url ?? (showField ? getUrl() : null);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center justify-center gap-2.5 rounded-full text-[13px] font-semibold tracking-wide transition-all duration-300 ease-premium ${
          variant === "quiet" ? "py-1" : "px-5 py-3"
        } ${block ? "w-full sm:w-auto" : ""} ${look}`}
      >
        {state === "copied" ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        <span>{state === "copied" ? "Link je kopiran" : label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Link je kopiran u međuspremnik." : state === "manual" ? "Kopiranje nije dopušteno — link je označen, kopirajte ga ručno." : ""}
      </span>
      {(showField || state === "manual") && shownUrl && (
        <input
          ref={fieldRef}
          readOnly
          value={shownUrl}
          aria-label="Link na vašu kuhinju"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-3 block w-full truncate rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 font-mono text-[11.5px] text-fg/75 outline-none focus:border-accent/60"
        />
      )}
    </div>
  );
}
