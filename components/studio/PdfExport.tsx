"use client";

/**
 * "Preuzmi PDF" — the kitchen as a multi-page A4 PDF (lib/pdf): cover, 3D views, floor plan, wall elevations, element
 * list, materials, rough price, contact.
 *
 * usePdfExport keeps one export at a time and its progress for every button on the page (top bar, summary, send step,
 * thank-you screen). The PDF code (jsPDF, fonts, drawings) is imported only when an export starts — or a moment
 * earlier, when the pointer rests on a button (prefetch) — so /studio and the homepage do not carry it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportOptions, ExportStage } from "@/lib/pdf/browser";
import { PdfIcon, CheckIcon } from "./icons";

export type PdfState =
  | { status: "idle" }
  | { status: "working"; stage: ExportStage; progress: number }
  | { status: "done"; fileName: string; pages: number; with3d: boolean }
  | { status: "error" };

export interface PdfExportApi {
  state: PdfState;
  /** start an export (ignored while one runs) */
  start: () => void;
  /** load the PDF code ahead of a click */
  prefetch: () => void;
}

export type PdfOptions = Omit<ExportOptions, "onProgress" | "download">;

const STAGE_TEXT: Record<ExportStage, string> = {
  slike: "Snimam 3D prikaze",
  dokument: "Crtam nacrte i slažem PDF",
  spremanje: "Spremam PDF",
};

/** percent for people */
const pct = (p: number) => `${Math.round(p * 100)} %`;

export function usePdfExport(getOptions: () => PdfOptions, announce?: (text: string) => void): PdfExportApi {
  const [state, setState] = useState<PdfState>({ status: "idle" });
  const busy = useRef(false);
  const latest = useRef({ getOptions, announce });
  const reset = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = { getOptions, announce };
  });
  useEffect(() => () => window.clearTimeout(reset.current), []);

  const prefetch = useCallback(() => {
    void import("@/lib/pdf/browser").catch(() => {});
  }, []);

  const start = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    window.clearTimeout(reset.current);
    setState({ status: "working", stage: "slike", progress: 0.01 });
    latest.current.announce?.("Pripremam PDF vaše kuhinje…");
    void (async () => {
      let ok = false;
      try {
        const { exportKitchenPdf } = await import("@/lib/pdf/browser");
        let shown = 0;
        const res = await exportKitchenPdf({
          ...latest.current.getOptions(),
          onProgress: (stage, p) => {
            // a re-render per percent at most
            if (p - shown >= 0.01 || p >= 1) {
              shown = p;
              setState({ status: "working", stage, progress: p });
            }
          },
        });
        ok = true;
        setState({ status: "done", fileName: res.fileName, pages: res.pages, with3d: res.with3d });
        latest.current.announce?.(`PDF je spreman i preuzima se: ${res.pages} stranica.`);
      } catch (err) {
        console.error("[studio] PDF nije uspio:", err);
        setState({ status: "error" });
        latest.current.announce?.("PDF nije uspio. Pokušajte ponovno.");
      } finally {
        busy.current = false;
        reset.current = window.setTimeout(() => setState({ status: "idle" }), ok ? 6000 : 8000);
      }
    })();
  }, []);

  return { state, start, prefetch };
}

/** a progress ring around an icon (0..1) */
function Ring({ progress, size = 40 }: { progress: number; size?: number }) {
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="pointer-events-none absolute inset-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, progress)))}
        className="text-accent transition-[stroke-dashoffset] duration-300 ease-premium"
      />
    </svg>
  );
}

export function PdfButton({
  pdf,
  variant = "outline",
  label = "Preuzmi PDF",
  hint,
  className = "",
}: {
  pdf: PdfExportApi;
  /** icon: a round top-bar button · pill: top bar, desktop · outline / accent: a full button · quiet: a text link */
  variant?: "icon" | "pill" | "outline" | "accent" | "quiet";
  label?: string;
  /** a line under an outline / accent button while idle */
  hint?: string;
  className?: string;
}) {
  const { state, start, prefetch } = pdf;
  const working = state.status === "working";
  const progress = working ? state.progress : 0;
  const aria = working
    ? `Pripremam PDF, ${pct(progress)}`
    : state.status === "done"
      ? "PDF je preuzet. Preuzmi ponovno"
      : state.status === "error"
        ? "PDF nije uspio. Pokušaj ponovno"
        : "Preuzmi PDF kuhinje";
  const common = {
    type: "button" as const,
    onClick: start,
    onPointerEnter: prefetch,
    onFocus: prefetch,
    "aria-busy": working || undefined,
    "aria-disabled": working || undefined,
  };

  if (variant === "icon") {
    return (
      <button
        {...common}
        aria-label={aria}
        title="Preuzmi PDF kuhinje"
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-ink-900/40 text-fg/80 backdrop-blur-md transition-colors hover:text-fg ${working ? "cursor-progress" : ""} ${className}`}
      >
        {working && <Ring progress={progress} />}
        {state.status === "done" ? <CheckIcon className="h-[18px] w-[18px] text-accent" /> : <PdfIcon className="h-[18px] w-[18px]" />}
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        {...common}
        aria-label={aria}
        className={`relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border border-white/[0.12] bg-ink-900/40 px-4 text-[12px] font-medium text-fg/85 backdrop-blur-md transition-colors duration-300 ease-premium hover:border-accent/60 hover:text-accent ${working ? "cursor-progress" : ""} ${className}`}
      >
        {state.status === "done" ? <CheckIcon className="h-4 w-4 text-accent" /> : <PdfIcon className="h-4 w-4" />}
        <span className="tabular-nums">{working ? pct(progress) : state.status === "done" ? "Preuzeto" : state.status === "error" ? "Ponovno" : "PDF"}</span>
        {working && (
          <span aria-hidden="true" className="absolute inset-x-3 bottom-[5px] h-px overflow-hidden rounded-full bg-white/10">
            <span className="block h-full origin-left bg-accent transition-transform duration-300 ease-premium" style={{ transform: `scaleX(${progress})` }} />
          </span>
        )}
      </button>
    );
  }

  const text =
    state.status === "working"
      ? `${STAGE_TEXT[state.stage]}… ${pct(progress)}`
      : state.status === "done"
        ? "PDF je preuzet"
        : state.status === "error"
          ? "Nije uspjelo — pokušajte ponovno"
          : label;
  const note =
    state.status === "done"
      ? `${state.fileName} · ${state.pages} str.${state.with3d ? "" : " · bez 3D prikaza (3D nije dostupan)"}`
      : state.status === "error"
        ? "PDF se nije mogao složiti na ovom uređaju. Link na kuhinju i dalje radi."
        : hint;

  if (variant === "quiet") {
    return (
      <div className={className}>
        <button
          {...common}
          aria-label={aria}
          className={`inline-flex items-center gap-2.5 py-1 text-[13px] font-semibold tracking-wide text-fg/80 transition-colors duration-300 ease-premium hover:text-accent ${working ? "cursor-progress" : ""}`}
        >
          {state.status === "done" ? <CheckIcon className="h-4 w-4 text-accent" /> : <PdfIcon className="h-4 w-4" />}
          <span className="tabular-nums">{text}</span>
        </button>
      </div>
    );
  }

  const look = variant === "accent" ? "bg-accent text-ink hover:bg-fg" : "border border-white/20 text-fg hover:border-accent hover:text-accent";
  return (
    <div className={className}>
      <button
        {...common}
        aria-label={aria}
        className={`relative inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-5 py-3 text-[13px] font-semibold tracking-wide transition-all duration-300 ease-premium sm:w-auto ${look} ${working ? "cursor-progress" : ""}`}
      >
        {state.status === "done" ? <CheckIcon className="h-4 w-4" /> : <PdfIcon className="h-4 w-4" />}
        <span className="tabular-nums">{text}</span>
        {working && (
          <span aria-hidden="true" className={`absolute inset-x-5 bottom-[6px] h-px overflow-hidden rounded-full ${variant === "accent" ? "bg-ink/15" : "bg-white/10"}`}>
            <span
              className={`block h-full origin-left transition-transform duration-300 ease-premium ${variant === "accent" ? "bg-ink" : "bg-accent"}`}
              style={{ transform: `scaleX(${progress})` }}
            />
          </span>
        )}
      </button>
      {note && <p className="mt-2 text-[11.5px] leading-snug text-mut">{note}</p>}
    </div>
  );
}
