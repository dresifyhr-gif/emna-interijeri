"use server";

/**
 * Server actions for Upiti. Every action checks the Origin and the admin session first
 * (requireAdminAction), validates its input, and only then touches the database.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult, NotesSaveResult } from "@/components/admin/leads/types";
import { LEAD_NOTES_MAX, deleteLead, isUuid, updateLeadNotes, updateLeadStatus } from "@/lib/admin/leads";
import { LEAD_STATUS_LABEL } from "@/lib/admin/status";
import { AdminForbiddenError, getSession, isSameOriginAction, requireAdminAction } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { isLeadStatus } from "@/lib/db/enums";

const fail = (message: string): ActionResult => ({ ok: false, message, at: Date.now() });

/** form fields: id, status */
export async function setLeadStatusAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = formData.get("id");
  const status = formData.get("status");
  if (!isUuid(id) || !isLeadStatus(status)) return fail("Neispravan zahtjev. Osvježite stranicu.");

  try {
    if (!(await updateLeadStatus(id, status))) return fail("Ovaj upit više ne postoji.");
  } catch (err) {
    console.error(`[admin] status upita nije spremljen (${dbErrorLabel(err)})`);
    return fail("Status nije spremljen. Pokušajte ponovno.");
  }

  // the nav badge (layout), the dashboard and the lists all show statuses
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Status je sada „${LEAD_STATUS_LABEL[status]}“.`, at: Date.now() };
}

/**
 * Autosave of the internal notes, called from the editor (not a form).
 * An expired session is reported instead of redirecting, so the typed text is never lost.
 */
export async function saveLeadNotesAction(id: unknown, notes: unknown): Promise<NotesSaveResult> {
  if (!(await isSameOriginAction())) throw new AdminForbiddenError();
  if (!(await getSession())) {
    return {
      ok: false,
      expired: true,
      error: "Prijava je istekla. Kopirajte tekst bilješke, prijavite se ponovno i zalijepite ga.",
    };
  }
  if (!isUuid(id) || typeof notes !== "string") return { ok: false, error: "Neispravan zahtjev. Osvježite stranicu." };
  if (notes.length > LEAD_NOTES_MAX) return { ok: false, error: `Bilješke mogu imati najviše ${LEAD_NOTES_MAX} znakova.` };

  let savedAt: Date | null;
  try {
    savedAt = await updateLeadNotes(id, notes);
  } catch (err) {
    console.error(`[admin] bilješke nisu spremljene (${dbErrorLabel(err)})`);
    return { ok: false, error: "Bilješke nisu spremljene. Pokušat ću ponovno čim nešto promijenite." };
  }
  if (!savedAt) return { ok: false, error: "Ovaj upit više ne postoji." };

  revalidatePath(`/admin/upiti/${id}`);
  return { ok: true, savedAt: savedAt.toISOString() };
}

/** form field: id — deletes the lead and its 3D snapshot, then goes back to the list */
export async function deleteLeadAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = formData.get("id");
  if (!isUuid(id)) return fail("Neispravan zahtjev. Osvježite stranicu.");

  let result: Awaited<ReturnType<typeof deleteLead>>;
  try {
    result = await deleteLead(id);
  } catch (err) {
    console.error(`[admin] upit nije obrisan (${dbErrorLabel(err)})`);
    return fail("Upit nije obrisan. Pokušajte ponovno.");
  }

  revalidatePath("/admin", "layout");
  if (!result) redirect("/admin/upiti");
  const params = new URLSearchParams({ obrisan: result.number });
  if (!result.snapshotDeleted) params.set("slika", "0");
  redirect(`/admin/upiti?${params.toString()}`);
}
