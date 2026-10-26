/**
 * GET /studio/tvrtka — the company facts the kitchen PDF prints on its contact page (lib/pdf/company.ts PdfCompany):
 * what the owner entered in /admin/postavke, falling back field by field to lib/site.ts (lib/admin/quotes.ts
 * getCompanyInfo). Only the public document subset — the same facts the customer's quote page shows — and nothing
 * invented: unknown fields are null. Called by the studio's "Preuzmi PDF" at export time only, so /studio itself stays
 * static and the PDF code loads lazily.
 */
import { connection } from "next/server";
import { getCompanyInfo } from "@/lib/admin/quotes";

export async function GET() {
  await connection();
  const c = await getCompanyInfo();
  const body = {
    brand: c.brand,
    name: c.name,
    address: c.address,
    oib: c.oib,
    phone: c.phone,
    email: c.email,
    web: c.web,
    legalLine: c.legalLine,
  };
  return Response.json(body, {
    headers: {
      // a few minutes at the edge: the facts change rarely, and a save in admin shows up shortly after
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "x-robots-tag": "noindex",
    },
  });
}
