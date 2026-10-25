import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, LinkButton } from "@/components/admin/ui";
import { PrintButton } from "@/components/admin/quotes/QuoteActions";
import { QuoteDocument, QuotePrintStyles } from "@/components/admin/quotes/QuoteDocument";
import { adminFileUrl } from "@/lib/admin/files";
import { getCompanyInfo, getQuoteDetail, toDocumentData, type QuoteDetail } from "@/lib/admin/quotes";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";

export const metadata: Metadata = { title: "Ispis ponude" };

/**
 * A4 print view. The print stylesheet hides the admin frame and everything but the sheet, so
 * "Ispiši / spremi PDF" (window.print) gives a clean document — or a PDF via the browser's
 * "Spremi kao PDF" destination.
 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  let detail: QuoteDetail | null = null;
  try {
    detail = await getQuoteDetail(id);
  } catch (err) {
    console.error(`[admin] ispis ponude se ne može učitati (${dbErrorLabel(err)})`);
    return (
      <Alert tone="danger" title="Ponuda se trenutno ne može učitati.">
        Baza podataka ne odgovara. Osvježite stranicu za minutu.
      </Alert>
    );
  }
  if (!detail) notFound();

  const company = await getCompanyInfo();
  const image = detail.lead?.snapshotPath ? adminFileUrl(detail.lead.snapshotPath) : null;
  const data = toDocumentData(detail.quote, detail.status, company, image);

  return (
    <>
      <QuotePrintStyles />
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <LinkButton href={`/admin/ponude/${detail.quote.id}`} variant="ghost" size="sm">
            ← Natrag na ponudu {detail.quote.number}
          </LinkButton>
          <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-mut">
            Za PDF u prozoru za ispis odaberite odredište <span className="text-fg/85">„Spremi kao PDF”</span>. Za čist list isključite{" "}
            <span className="text-fg/85">„Zaglavlja i podnožja”</span>; uključite <span className="text-fg/85">„Grafika pozadine”</span> ako se
            linije ne vide.
          </p>
        </div>
        <PrintButton />
      </div>
      {detail.status === "nacrt" && (
        <Alert tone="info" className="no-print mb-6">
          Ovo je nacrt — na ispisu piše „Nacrt” dok ponudu ne označite kao poslanu.
        </Alert>
      )}
      <div className="rounded-2xl bg-ink-900/60 p-2 sm:p-8 print:bg-transparent print:p-0">
        <QuoteDocument data={data} />
      </div>
    </>
  );
}
