/**
 * Kitchen PDF export — "Vaša kuhinja": a multi-page A4 document (cover with a 3D render, 3D views, floor plan and wall
 * elevations to scale with dimensions, element list, materials, rough price, next steps and contact) built entirely in
 * the browser from a KitchenConfig.
 *
 *   const { createKitchenPdf } = await import("@/lib/pdf");          // lazy: jsPDF + fonts load only on export
 *   const { blob, fileName } = await createKitchenPdf({ cfg, configUrl, views, hero, company, showPrice: true });
 *
 * Framework-agnostic: jsPDF (vector text in the site's fonts, Unicode), the drawings from lib/studio/drawings (pure),
 * the content model in content.ts (pure). The browser-only steps — pictures from the 3D engine, image loading, the
 * download — are in ./browser.ts.
 */

import { isoDay, renderKitchenPdf, type KitchenPdfInput } from "./document";

export { isoDay, longDate, renderKitchenPdf, type KitchenPdfDoc, type KitchenPdfInput, type PdfImage } from "./document";
export {
  LAYOUT_NAME,
  NEXT_STEPS,
  OPENING_SHORT,
  bodySize,
  elementGroups,
  elementNotes,
  elementsWord,
  hasFronts,
  kitchenPdfContent,
  materials,
  pricePolicy,
  priceInfo,
  type ElementGroup,
  type ElementRow,
  type KitchenPdfContent,
  type MaterialCard,
  type PdfFact,
  type PriceInfo,
  type SpecLine,
} from "./content";
export { companyFromSite, companyLegal, companyLines, normalizeCompany, type PdfCompany } from "./company";
export { paintSvg, parseSvg, svgSize } from "./svg-paint";
export { drawQr, qrMatrix } from "./qr";

/** "EMNA-kuhinja-2026-10-26.pdf" (with a reference: "EMNA-kuhinja-U-2026-0012-2026-10-26.pdf") */
export function kitchenPdfFileName(date: Date, opts: { brand?: string; reference?: string | null } = {}): string {
  const safe = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
      .replace(/[^A-Za-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  const brand = safe((opts.brand ?? "EMNA").split(" ")[0] ?? "") || "EMNA";
  const ref = opts.reference ? safe(opts.reference) : "";
  return `${brand.toUpperCase()}-kuhinja-${ref ? `${ref}-` : ""}${isoDay(date)}.pdf`;
}

export interface KitchenPdfFile {
  blob: Blob;
  fileName: string;
  pages: number;
  /** bytes */
  size: number;
}

/** build the document and return it as a PDF file */
export async function createKitchenPdf(input: KitchenPdfInput): Promise<KitchenPdfFile> {
  const date = input.date ?? new Date();
  const doc = await renderKitchenPdf({ ...input, date });
  const bytes = doc.pdf.output("arraybuffer");
  const blob = new Blob([bytes], { type: "application/pdf" });
  return {
    blob,
    fileName: kitchenPdfFileName(date, { brand: input.company?.brand, reference: input.fileTag }),
    pages: doc.pages,
    size: bytes.byteLength,
  };
}
