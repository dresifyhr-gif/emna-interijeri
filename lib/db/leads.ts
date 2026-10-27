/**
 * Write helpers for leads (upiti). Read queries live with the pages that need them.
 *
 *   const { id, number } = await insertLead({ source: "kontakt", name, phone, email });
 */
import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, pgErrorCode, type Db } from "./index";
import { nextLeadNumber } from "./numbers";
import { leads, type NewLead } from "./schema";
import { LEAD_STATUSES, type LeadStatus } from "./enums";

export type LeadInsert = Omit<NewLead, "id" | "number" | "createdAt" | "updatedAt">;

/** inserts a lead with the next "U-YYYY-NNNN" number; retries if that number is somehow taken */
export async function insertLead(values: LeadInsert, opts: { db?: Db; at?: Date } = {}): Promise<{ id: string; number: string }> {
  const db = opts.db ?? getDb();
  for (let attempt = 0; ; attempt++) {
    const number = await nextLeadNumber({ db, at: opts.at });
    try {
      const [row] = await db.insert(leads).values({ ...values, number }).returning({ id: leads.id, number: leads.number });
      if (!row) throw new Error("lead insert returned no row");
      return row;
    } catch (err) {
      // 23505 = unique_violation (only `number` can collide); anything else is a real failure
      if (pgErrorCode(err) !== "23505" || attempt >= 2) throw err;
    }
  }
}

/**
 * The newest lead with exactly these contact details stored at or after `since`, or null. Asked before an inquiry is
 * stored a second time: the first INSERT may have landed even though its reply was lost.
 */
export async function findLeadSince(
  match: { name: string; phone: string; email: string },
  since: Date,
  db: Db = getDb(),
): Promise<{ id: string; number: string; snapshotPath: string | null } | null> {
  const [row] = await db
    .select({ id: leads.id, number: leads.number, snapshotPath: leads.snapshotPath })
    .from(leads)
    .where(and(eq(leads.name, match.name), eq(leads.phone, match.phone), eq(leads.email, match.email), gte(leads.createdAt, since)))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return row ?? null;
}

export async function setLeadSnapshot(id: string, snapshotPath: string, db: Db = getDb()): Promise<void> {
  await db.update(leads).set({ snapshotPath }).where(eq(leads.id, id));
}

/** records which lead e-mails went out (owner notification / customer confirmation) */
export async function markLeadNotified(
  id: string,
  sent: { owner: boolean; confirmation: boolean },
  db: Db = getDb(),
): Promise<void> {
  if (!sent.owner && !sent.confirmation) return;
  await db
    .update(leads)
    .set({
      ...(sent.owner ? { notifiedAt: sql`now()` } : {}),
      ...(sent.confirmation ? { confirmationSentAt: sql`now()` } : {}),
    })
    .where(eq(leads.id, id));
}

/** { novi: 3, u_obradi: 1, … } with every status present (0 when none) */
export async function leadCountsByStatus(db: Db = getDb()): Promise<Record<LeadStatus, number>> {
  const rows = await db
    .select({ status: leads.status, n: sql<number>`count(*)::int` })
    .from(leads)
    .groupBy(leads.status);
  const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
