"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";
import { LinkButton } from "@/components/ui/Button";
import { CopyLinkButton } from "./CopyLink";
import { EASE } from "./meta";
import { PdfButton, type PdfExportApi } from "./PdfExport";
import type { SentInfo } from "./useStudioLead";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Thank-you screen after the API confirmed the send. The kitchen stays visible behind it.
 * A real modal: <Studio> makes everything behind it inert, Tab stays inside, Esc closes it.
 */
export function SuccessOverlay({
  sent,
  getUrl,
  pdf,
  onContinue,
}: {
  sent: SentInfo;
  getUrl: () => string;
  /** "Preuzmi PDF" — the kitchen they just sent, to keep */
  pdf?: PdfExportApi;
  onContinue: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const dialogRef = useRef<HTMLDivElement>(null);
  /** what had focus before the dialog (the send button) — focus goes back there when it closes */
  const restoreTo = useRef<HTMLElement | null>(null);
  const focusTitle = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== el && active !== document.body) restoreTo.current = active;
    el.focus({ preventScroll: true });
  }, []);

  // focus trap + Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onContinue();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      const atStart = active === first || (inside && !items.includes(active as HTMLElement));
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && atStart) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onContinue]);

  // runs after <Studio> has lifted `inert` from the page behind, so the old element can take focus again
  useEffect(
    () => () => {
      const el = restoreTo.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
    },
    [],
  );

  const draw = (delay: number, duration: number) =>
    reduce
      ? { initial: false as const }
      : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration, delay, ease: EASE } };

  return (
    <motion.div
      ref={dialogRef}
      className="absolute inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-gradient-to-t from-ink-900/95 via-ink-900/70 to-ink-900/25 p-4 sm:items-center sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.8, ease: EASE } }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-thanks"
      aria-describedby="studio-thanks-text"
    >
      <motion.div
        className="glass relative w-full max-w-[560px] rounded-[28px] p-7 sm:p-10"
        initial={{ opacity: 0, y: reduce ? 0 : 24 }}
        animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.15, ease: EASE } }}
      >
        <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" className="text-accent">
          <motion.circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.2" {...draw(0.2, 1.1)} />
          <motion.path
            d="M20 33l8 8 16-18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...draw(0.9, 0.6)}
          />
        </svg>
        <p className="eyebrow mt-7 text-accent">Upit je poslan</p>
        <h2 id="studio-thanks" ref={focusTitle} tabIndex={-1} className="display mt-4 text-[clamp(40px,7vw,68px)] outline-none">
          Hvala, {sent.first}.
        </h2>
        <p id="studio-thanks-text" className="mt-5 max-w-md text-[15px] leading-relaxed text-fg/80">
          Vaša kuhinja je stigla do nas — s mjerama, materijalima{sent.withImage ? ", slikom" : ""} i linkom. Javit ćemo vam se
          telefonom ili e-mailom da dogovorimo izmjeru i sljedeće korake.
        </p>
        <p className="mt-3 max-w-md text-[13px] leading-relaxed text-mut">
          <ConfirmationLine sent={sent} /> Link na kuhinju možete spremiti i otvoriti kad god želite.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <CopyLinkButton getUrl={getUrl} variant="accent" block />
          {pdf && <PdfButton pdf={pdf} label="Preuzmi PDF" />}
          <LinkButton href="/" variant="outline" arrow className="py-3">
            Natrag na stranicu
          </LinkButton>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 text-[12.5px] text-mut underline decoration-white/20 underline-offset-4 transition-colors hover:text-fg"
        >
          Zatvori i nastavi razgledavati kuhinju
        </button>
      </motion.div>
    </motion.div>
  );
}

/** only says a confirmation went out when the API said so */
function ConfirmationLine({ sent }: { sent: SentInfo }) {
  const email = <span className="text-fg">{sent.email}</span>;
  if (sent.confirmation === true) return <>Kratku potvrdu sa sažetkom poslali smo na {email}.</>;
  if (sent.confirmation === false)
    return <>Potvrdu na {email} ovaj put nismo uspjeli poslati, ali vaš upit je stigao do nas.</>;
  return <>Ako je sve u redu, kratku potvrdu sa sažetkom dobit ćete na {email}.</>;
}
