/**
 * GET /api/admin/files/<blob pathname>[?download=1] — streams a PRIVATE Vercel Blob to a logged-in admin.
 *
 *   <img src={adminFileUrl(lead.snapshotPath)} alt="…" />      (lib/admin/files.ts)
 *
 * Only known prefixes (leads/, quotes/, uploads/) and safe path segments are served. Images and PDFs
 * render inline; anything else downloads. A sandboxing CSP means even a stored HTML/SVG file can
 * never run script on our origin.
 */
import { requireAdminApi } from "@/lib/auth/session";
import { INLINE_TYPES, getPrivateFile, isBlobConfigured, safeBlobPath } from "@/lib/admin/files";

const notFound = () =>
  new Response("Datoteka nije pronađena.", { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });

function filenameOf(pathname: string): string {
  const base = pathname.split("/").pop() || "datoteka";
  return base.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const auth = await requireAdminApi(req);
  if (auth instanceof Response) return auth;

  const { path } = await ctx.params;
  const pathname = safeBlobPath(path ?? []);
  if (!pathname || !isBlobConfigured()) return notFound();

  let file: Awaited<ReturnType<typeof getPrivateFile>>;
  try {
    file = await getPrivateFile(pathname, { ifNoneMatch: req.headers.get("if-none-match") ?? undefined });
  } catch (err) {
    console.error(`[admin] datoteka se ne može učitati (${err instanceof Error ? err.name : "unknown"})`);
    return new Response("Datoteka se trenutno ne može učitati.", { status: 502, headers: { "cache-control": "no-store" } });
  }
  if (!file) return notFound();

  const headers = new Headers({
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "x-robots-tag": "noindex, nofollow",
    etag: file.blob.etag,
    vary: "Cookie",
  });

  if (file.statusCode === 304) return new Response(null, { status: 304, headers });

  const type = (file.blob.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const download = new URL(req.url).searchParams.get("download") === "1" || !INLINE_TYPES.has(type);
  headers.set("content-type", INLINE_TYPES.has(type) ? type : "application/octet-stream");
  headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${filenameOf(pathname)}"`);
  // Chrome refuses to render PDFs under a sandbox CSP; everything else gets it
  if (type !== "application/pdf" || download) {
    headers.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'");
  }

  return new Response(file.stream, { status: 200, headers });
}
