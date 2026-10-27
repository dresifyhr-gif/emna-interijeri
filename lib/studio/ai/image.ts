/**
 * Server-side check of the customer's photo (a data URL): JPEG / PNG / WebP only, by the bytes themselves (not the
 * claimed type), at most LIMITS.imageBytes decoded and LIMITS.imageSide px on the longer side. The client downscales
 * to ≤ 1600 px / ≤ 1,5 MB JPEG (client.ts downscaleImage); anything else is refused with a Croatian message. Pure.
 */
import { LIMITS } from "./schema";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type ImageCheck =
  | { ok: true; mediaType: ImageMediaType; base64: string; bytes: number; width: number; height: number }
  | { ok: false; status: 400 | 413 | 415; message: string };

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

function sniff(b: Uint8Array): ImageMediaType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 16 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** pixel size from the file header; null when it cannot be read */
export function imageSize(b: Uint8Array, type: ImageMediaType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (b.length < 24) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (type === "image/webp") {
    if (b.length < 30) return null;
    const chunk = String.fromCharCode(...b.subarray(12, 16));
    if (chunk === "VP8 ") return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === "VP8L") return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }
  // JPEG: walk the markers to the first start-of-frame
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
      i += m === 0xff ? 1 : 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

export function checkImage(dataUrl: string): ImageCheck {
  // a base64 data URL is 4/3 of the bytes; refuse an oversized string before decoding it
  if (dataUrl.length > Math.ceil((LIMITS.imageBytes * 4) / 3) + 200) {
    return { ok: false, status: 413, message: "Slika je prevelika — pošaljite manju (najviše 1,5 MB)." };
  }
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return { ok: false, status: 400, message: "Slika nije ispravno poslana — pokušajte je dodati ponovno." };
  const base64 = m[2].replace(/\s+/g, "");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { ok: false, status: 400, message: "Slika je prazna." };
  if (bytes.length > LIMITS.imageBytes) return { ok: false, status: 413, message: "Slika je prevelika — pošaljite manju (najviše 1,5 MB)." };
  const type = sniff(bytes);
  if (!type) return { ok: false, status: 415, message: "Podržane su samo fotografije JPEG, PNG i WebP." };
  const size = imageSize(bytes, type);
  if (!size || size.width < 16 || size.height < 16) return { ok: false, status: 400, message: "Slika se ne može pročitati — pokušajte s drugom." };
  if (Math.max(size.width, size.height) > LIMITS.imageSide) {
    return { ok: false, status: 413, message: `Slika je prevelika — najviše ${LIMITS.imageSide} px po duljoj strani.` };
  }
  return { ok: true, mediaType: type, base64, bytes: bytes.length, width: size.width, height: size.height };
}
