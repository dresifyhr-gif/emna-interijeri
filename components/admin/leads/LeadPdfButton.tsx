"use client";

/**
 * "Preuzmi PDF kuhinje" on an inquiry (and on its quote): the customer's kitchen from the stored config as the same
 * A4 PDF the studio gives the customer (lib/pdf), generated here in the browser. The 3D pictures come from a studio
 * engine started off screen for the export (three.js loads only then); without WebGL the inquiry's own picture is the
 * cover and the PDF has no 3D page. The company block uses the facts from Postavke (passed in by the server page).
 *
 * The rough price is in only when ticked — by default once the catalogue's prices are confirmed (lib/pdf content.ts
 * pricePolicy("admin")): the PDF goes out in the company's name.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Spinner, buttonClass, cx } from "@/components/admin/ui";
import type { PdfCompany } from "@/lib/pdf/company";
import { IconDownload } from "./icons";

type State =
  | { status: "idle" }
  | { status: "working"; text: string; progress: number }
  | { status: "done"; text: string }
  | { status: "error"; text: string };

const STAGE: Record<string, string> = {
  slike: "Snimam 3D prikaze",
  dokument: "Slažem PDF",
  spremanje: "Spremam",
};

export function LeadPdfButton({
  config,
  configUrl,
  leadNumber,
  customerName,
  snapshotUrl,
  company,
  pricesConfirmed,
  defaultPrice,
  size = "md",
  variant = "secondary",
  withOptions = true,
  className,
}: {
  /** leads.config (sanitized again before use) */
  config: unknown;
  configUrl: string | null;
  leadNumber: string;
  customerName: string | null;
  /** the inquiry's own 3D picture (admin file route) — the cover when 3D cannot render here */
  snapshotUrl: string | null;
  company: PdfCompany;
  /** lib/studio/catalog.ts PRICES_CONFIRMED (read on the server) */
  pricesConfirmed: boolean;
  /** the price switch's start value; absent = pricesConfirmed */
  defaultPrice?: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  /** show the "okvirna cijena" switch next to the button */
  withOptions?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [withPrice, setWithPrice] = useState(defaultPrice ?? pricesConfirmed);
  const busy = useRef(false);
  const reset = useRef<number | undefined>(undefined);
  const id = useId();

  useEffect(() => () => window.clearTimeout(reset.current), []);

  async function run() {
    if (busy.current) return;
    busy.current = true;
    window.clearTimeout(reset.current);
    setState({ status: "working", text: "Pripremam", progress: 0.01 });
    try {
      const { exportKitchenPdf } = await import("@/lib/pdf/browser");
      let shown = 0;
      const res = await exportKitchenPdf({
        source: "admin",
        cfg: config,
        configUrl,
        showPrice: withPrice,
        pictures: { offscreen: true, fallback: snapshotUrl },
        company,
        preparedFor: customerName,
        reference: `Upit ${leadNumber}`,
        fileTag: leadNumber,
        onProgress: (stage, p) => {
          if (p - shown >= 0.01 || p >= 1) {
            shown = p;
            setState({ status: "working", text: STAGE[stage] ?? "Pripremam", progress: p });
          }
        },
      });
      setState({
        status: "done",
        text: `Preuzeto: ${res.fileName} · ${res.pages} str.${res.with3d ? "" : " · bez 3D prikaza (WebGL nije dostupan, naslovnica je slika iz upita)"}`,
      });
    } catch (err) {
      console.error("[admin] PDF kuhinje nije uspio:", err);
      setState({ status: "error", text: "PDF nije uspio. Pokušajte ponovno ili otvorite kuhinju u studiju i preuzmite PDF tamo." });
    } finally {
      busy.current = false;
      reset.current = window.setTimeout(() => setState({ status: "idle" }), 9000);
    }
  }

  const working = state.status === "working";
  return (
    <div className={cx("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={run}
          onPointerEnter={() => void import("@/lib/pdf/browser").catch(() => {})}
          aria-busy={working || undefined}
          aria-disabled={working || undefined}
          aria-describedby={`${id}-status`}
          className={buttonClass(variant, size, cx("relative overflow-hidden", working && "cursor-progress"))}
        >
          {working ? <Spinner /> : <IconDownload size={size === "sm" ? 14 : 16} />}
          <span className="tabular-nums">{working ? `${state.text}… ${Math.round(state.progress * 100)} %` : "Preuzmi PDF kuhinje"}</span>
          {working && (
            <span aria-hidden className="absolute inset-x-4 bottom-[3px] h-px overflow-hidden rounded-full bg-white/10">
              <span className="block h-full origin-left bg-accent transition-transform duration-300" style={{ transform: `scaleX(${state.progress})` }} />
            </span>
          )}
        </button>
        {withOptions && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-fg/75">
            <input
              type="checkbox"
              checked={withPrice}
              onChange={(e) => setWithPrice(e.target.checked)}
              disabled={working}
              className="h-4 w-4 cursor-pointer accent-[#C9B99A]"
            />
            S okvirnom cijenom iz studija
          </label>
        )}
      </div>
      <p id={`${id}-status`} role="status" aria-live="polite" className={cx("mt-2 text-[12px] leading-snug", state.status === "error" ? "text-rose-300" : "text-mut")}>
        {state.status === "done" || state.status === "error"
          ? state.text
          : withOptions && withPrice && !pricesConfirmed
            ? "Cijene u katalogu studija još nisu potvrđene — okvirna cijena u PDF-u je samo procjena studija."
            : ""}
      </p>
    </div>
  );
}
