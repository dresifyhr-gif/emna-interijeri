/**
 * QR codes as vectors: the module matrix from `uqr` (pure TypeScript, any runtime), drawn as filled rectangles — one per
 * run of dark modules in a row, so a version-10 code stays a few hundred path operations and prints razor sharp.
 */

import type { jsPDF } from "jspdf";
import { encode } from "uqr";

export interface QrMatrix {
  /** modules per side (without a quiet zone) */
  size: number;
  /** [row][col], true = dark */
  data: boolean[][];
}

/** the QR matrix of a text (a URL); error correction M for short texts, L for long ones (smaller code) */
export function qrMatrix(text: string): QrMatrix {
  const res = encode(text, { ecc: text.length > 600 ? "L" : "M", border: 0 });
  return { size: res.size, data: res.data };
}

/**
 * Draw a QR code at (x, y), `size` mm square including a quiet zone of `quiet` modules on the given light colour
 * (absent = no background). Returns the module size (mm).
 */
export function drawQr(
  pdf: jsPDF,
  qr: QrMatrix,
  x: number,
  y: number,
  size: number,
  opts: { dark?: string; light?: string | null; quiet?: number } = {},
): number {
  const quiet = opts.quiet ?? 2;
  const m = size / (qr.size + 2 * quiet);
  if (opts.light) {
    pdf.setFillColor(opts.light);
    pdf.rect(x, y, size, size, "F");
  }
  pdf.setFillColor(opts.dark ?? "#000000");
  const x0 = x + quiet * m;
  const y0 = y + quiet * m;
  // a hair of overlap closes the seams some viewers show between neighbouring rectangles
  const e = m * 0.02;
  for (let r = 0; r < qr.size; r++) {
    const row = qr.data[r];
    let c = 0;
    while (c < qr.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < qr.size && row[c]) c++;
      pdf.rect(x0 + start * m - e, y0 + r * m - e, (c - start) * m + 2 * e, m + 2 * e, "F");
    }
  }
  return m;
}
