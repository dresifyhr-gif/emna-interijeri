/**
 * GET /api/ponuda/<token>/slika — the 3D view of the kitchen on the customer's quote page.
 * Streams the linked inquiry's private snapshot (JPEG/PNG only). Drafts only for a logged-in admin.
 */
import { getPrivateFile, isBlobConfigured } from "@/lib/admin/files";
import { isQuoteToken, quoteSnapshotForToken } from "@/lib/admin/quotes";
import { getSession } from "@/lib/auth/session";
import { dbErrorLabel, isDbConfigured } from "@/lib/db";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

const notFound = () =>
  new Response("Slika nije pronađena.", {
    status: 404,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
  });

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isQuoteToken(token) || !isDbConfigured() || !isBlobConfigured()) return notFound();

  let file: Awaited<ReturnType<typeof getPrivateFile>> = null;
  try {
    const admin = await getSession();
    const path = await quoteSnapshotForToken(token, { allowDraft: Boolean(admin) });
    if (!path) return notFound();
    file = await getPrivateFile(path, { ifNoneMatch: req.headers.get("if-none-match") ?? undefined });
  } catch (err) {
    console.error(`[ponuda] slika se ne može učitati (${dbErrorLabel(err)})`);
    return new Response("Slika se trenutno ne može učitati.", { status: 502, headers: { "cache-control": "no-store" } });
  }
  if (!file) return notFound();

  const headers = new Headers({
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    etag: file.blob.etag,
  });
  if (file.statusCode === 304) return new Response(null, { status: 304, headers });

  const type = (file.blob.contentType || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return notFound();
  headers.set("content-type", type);
  headers.set("content-disposition", `inline; filename="kuhinja-3d.${type === "image/png" ? "png" : "jpg"}"`);
  return new Response(file.stream, { status: 200, headers });
}
