"use server";

/**
 * Server actions for /admin/ponude/**. Every action starts with requireAdminAction()
 * (Origin check + session); data rules live in lib/admin/quotes.ts.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { isQuoteStatus } from "@/lib/db/enums";
import { quoteTotals } from "@/lib/admin/quote-math";
import { isQuoteEmailConfigured, sendQuoteToCustomer } from "@/lib/admin/quote-email";
import {
  changeQuoteStatus,
  createQuote,
  deleteDraftQuote,
  duplicateQuote,
  getCompanyInfo,
  getQuoteDetail,
  isUuid,
  markQuoteSent,
  parseQuoteInput,
  publicQuoteUrl,
  updateQuote,
} from "@/lib/admin/quotes";
import { isValidEmail } from "@/lib/lead-client";
import { isPastDay, isQuoteLocked, type QuoteActionResult, type SaveQuoteResult } from "@/components/admin/quotes/model";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const UNAVAILABLE = "Baza podataka trenutno ne odgovara. Pokušajte ponovno za minutu.";

function revalidateQuote(id: string | null, leadId: string | null = null) {
  revalidatePath("/admin/ponude");
  if (id) revalidatePath(`/admin/ponude/${id}`);
  revalidatePath("/admin");
  if (leadId) {
    revalidatePath("/admin/upiti");
    revalidatePath(`/admin/upiti/${leadId}`);
  }
}

/** create (payload.id null) or update a quote from the editor */
export async function saveQuoteAction(payload: unknown): Promise<SaveQuoteResult> {
  await requireAdminAction();
  const p = isObj(payload) ? payload : {};
  const id = p.id === null || p.id === undefined ? null : p.id;
  if (id !== null && !isUuid(id)) return { ok: false, error: "Ponuda nije pronađena." };

  const parsed = parseQuoteInput(p.values);
  if (!parsed.ok) return { ok: false, error: "Provjerite označena polja.", fieldErrors: parsed.fieldErrors };

  try {
    const leadId = typeof p.leadId === "string" && isUuid(p.leadId) ? p.leadId : null;
    const res = id
      ? await updateQuote(id, parsed.value, typeof p.version === "string" ? p.version : null)
      : await createQuote(parsed.value, { leadId });
    if (res.ok) revalidateQuote(res.id, id ? null : leadId);
    return res;
  } catch (err) {
    console.error(`[ponude] spremanje nije uspjelo (${dbErrorLabel(err)})`);
    return { ok: false, error: "Spremanje trenutno nije moguće. Pokušajte ponovno za minutu." };
  }
}

export async function changeQuoteStatusAction(id: unknown, status: unknown): Promise<QuoteActionResult> {
  await requireAdminAction();
  if (!isUuid(id) || !isQuoteStatus(status)) return { ok: false, error: "Nepoznata ponuda ili status." };
  try {
    const res = await changeQuoteStatus(id, status);
    if (!res.ok) return res;
    revalidateQuote(id, res.leadId);
    return { ok: true, message: res.message };
  } catch (err) {
    console.error(`[ponude] promjena statusa nije uspjela (${dbErrorLabel(err)})`);
    return { ok: false, error: UNAVAILABLE };
  }
}

/** e-mails the customer the link to /ponuda/<token> and marks the quote as sent (only with Resend configured) */
export async function sendQuoteEmailAction(id: unknown): Promise<QuoteActionResult> {
  await requireAdminAction();
  if (!isUuid(id)) return { ok: false, error: "Ponuda nije pronađena." };
  if (!isQuoteEmailConfigured()) return { ok: false, error: "Slanje e-maila još nije uključeno (Resend nije postavljen)." };

  let number = "";
  try {
    const d = await getQuoteDetail(id);
    if (!d) return { ok: false, error: "Ponuda nije pronađena." };
    const q = d.quote;
    number = q.number;
    if (isQuoteLocked(d.status)) return { ok: false, error: "Kupac je već odgovorio na ovu ponudu." };
    const to = q.customerEmail?.trim() ?? "";
    if (!to || !isValidEmail(to)) return { ok: false, error: "Upišite ispravan e-mail kupca i spremite ponudu." };
    if (!Array.isArray(q.items) || q.items.length === 0) return { ok: false, error: "Ponuda nema nijednu stavku." };
    if (isPastDay(q.validUntil)) return { ok: false, error: "Rok valjanosti je prošao. Produljite ga i spremite ponudu." };
    if (q.sentAt && Date.now() - q.sentAt.getTime() < 60_000) {
      return { ok: false, error: "Ponuda je upravo poslana. Pričekajte minutu prije ponovnog slanja." };
    }

    const company = await getCompanyInfo();
    const sent = await sendQuoteToCustomer({
      to,
      customerName: q.customerName,
      number: q.number,
      title: q.title,
      totalCents: quoteTotals(q.items, q.discountPct, q.vatPct).totalCents,
      validUntil: q.validUntil,
      link: publicQuoteUrl(q.publicToken),
      company,
    });
    if (!sent.ok) return { ok: false, error: "E-mail nije poslan. Pokušajte ponovno ili pošaljite poveznicu ručno." };

    await markQuoteSent(id);
    revalidateQuote(id, q.leadId);
    return { ok: true, message: `Ponuda je poslana na ${to}.` };
  } catch (err) {
    console.error(`[ponude] ${number || "?"}: slanje nije uspjelo (${dbErrorLabel(err)})`);
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function duplicateQuoteAction(formData: FormData): Promise<void> {
  await requireAdminAction();
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/admin/ponude");
  let target: string | null = null;
  try {
    const copy = await duplicateQuote(id);
    target = copy?.id ?? null;
  } catch (err) {
    console.error(`[ponude] dupliciranje nije uspjelo (${dbErrorLabel(err)})`);
    throw new Error("Ponuda se trenutno ne može duplicirati.");
  }
  if (!target) redirect("/admin/ponude");
  revalidateQuote(target);
  redirect(`/admin/ponude/${target}`);
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  await requireAdminAction();
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/admin/ponude");
  let number: string | null = null;
  try {
    const res = await deleteDraftQuote(id);
    if (!res.ok) throw new Error(res.error);
    number = res.number;
  } catch (err) {
    console.error(`[ponude] brisanje nije uspjelo (${dbErrorLabel(err)})`);
    throw new Error("Obrisati se mogu samo nacrti.");
  }
  revalidateQuote(null);
  redirect(`/admin/ponude?obrisana=${encodeURIComponent(number)}`);
}
