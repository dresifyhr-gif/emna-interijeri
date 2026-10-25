/**
 * Private file storage (Vercel Blob, access: "private").
 *
 * Files are never public: the browser only ever sees /api/admin/files/<pathname>, which checks the
 * admin session and streams the blob (app/api/admin/files/[...path]/route.ts).
 *
 *   const path = await putPrivateFile(leadSnapshotPath(id, "image/jpeg"), bytes, "image/jpeg");
 *   <img src={adminFileUrl(lead.snapshotPath)} />
 */
import "server-only";
import { get, put } from "@vercel/blob";

/** top-level folders the admin file route will serve; anything else is 404 */
export const FILE_PREFIXES = ["leads/", "quotes/", "uploads/"] as const;

/** content types that may be shown inline in the admin; everything else downloads */
export const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]);

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Normalises and validates a blob pathname (no "..", no leading slash, known prefix,
 * conservative characters). Returns null when it is not something we'd ever have written.
 */
export function safeBlobPath(raw: string | readonly string[]): string | null {
  const parts = (typeof raw === "string" ? raw.split("/") : [...raw]).filter((p) => p !== "");
  if (parts.length < 2 || parts.length > 6) return null;
  if (!parts.every((p) => SEGMENT.test(p) && !p.includes(".."))) return null;
  const path = parts.join("/");
  if (path.length > 300) return null;
  return FILE_PREFIXES.some((pre) => path.startsWith(pre)) ? path : null;
}

/** "leads/<id>.jpg" (or .png) */
export function leadSnapshotPath(leadId: string, contentType: "image/jpeg" | "image/png" = "image/jpeg"): string {
  return `leads/${leadId}.${contentType === "image/png" ? "png" : "jpg"}`;
}

/** URL of the authenticated admin route that streams a private blob */
export function adminFileUrl(pathname: string, opts: { download?: boolean } = {}): string {
  const encoded = pathname.split("/").map(encodeURIComponent).join("/");
  return `/api/admin/files/${encoded}${opts.download ? "?download=1" : ""}`;
}

/** uploads (or replaces) a private blob at exactly `pathname`; returns the pathname to store in the DB */
export async function putPrivateFile(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer | ReadableStream | string,
  contentType: string,
): Promise<string> {
  const safe = safeBlobPath(pathname);
  if (!safe) throw new Error("invalid blob pathname");
  const res = await put(safe, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return res.pathname;
}

/** private blob as a stream (null when missing); pass `ifNoneMatch` to get a 304 */
export async function getPrivateFile(pathname: string, opts: { ifNoneMatch?: string } = {}) {
  const safe = safeBlobPath(pathname);
  if (!safe) return null;
  return get(safe, { access: "private", ifNoneMatch: opts.ifNoneMatch });
}
