"use server";

/**
 * Server actions for Postavke → Obavijesti (Web Push on this device) and the "new answers" marker on Ponude.
 * Each one checks the Origin and the admin session first (requireAdminAction); subscriptions are validated
 * by lib/admin/push.ts before anything is stored. Endpoints are never logged.
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import type { ActionResult } from "@/components/admin/leads/types";
import {
  QUOTES_SEEN_COOKIE,
  TEST_PAYLOAD,
  deletePushSubscription,
  isPushConfigured,
  normalizeSubscription,
  savePushSubscription,
  sendPush,
} from "@/lib/admin/push";
import { requireAdminAction } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";

const PAGE = "/admin/postavke/obavijesti";
const OFF = "Obavijesti još nisu uključene na poslužitelju.";

const fail = (message: string): ActionResult => ({ ok: false, message, at: Date.now() });
const done = (message: string): ActionResult => ({ ok: true, message, at: Date.now() });
const isEndpoint = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1000;

/** `subscription`: this device's PushSubscription.toJSON() */
export async function savePushSubscriptionAction(subscription: unknown): Promise<ActionResult> {
  const admin = await requireAdminAction();
  if (!isPushConfigured()) return fail(OFF);
  const sub = normalizeSubscription(subscription);
  if (!sub) return fail("Preglednik nije dao ispravnu pretplatu. Pokušajte ponovno ili u drugom pregledniku.");

  try {
    const ua = (await headers()).get("user-agent");
    await savePushSubscription(sub, { userId: admin.userId, ua });
  } catch (err) {
    console.error(`[admin] obavijesti nisu uključene (${dbErrorLabel(err)})`);
    return fail("Spremanje nije uspjelo. Pokušajte ponovno za minutu.");
  }
  revalidatePath(PAGE);
  return done("Obavijesti su uključene na ovom uređaju.");
}

export async function removePushSubscriptionAction(endpoint: unknown): Promise<ActionResult> {
  await requireAdminAction();
  if (!isEndpoint(endpoint)) return fail("Neispravan zahtjev. Osvježite stranicu.");
  try {
    await deletePushSubscription(endpoint);
  } catch (err) {
    console.error(`[admin] obavijesti nisu isključene (${dbErrorLabel(err)})`);
    return fail("Isključivanje nije spremljeno. Pokušajte ponovno za minutu.");
  }
  revalidatePath(PAGE);
  return done("Obavijesti su isključene na ovom uređaju.");
}

/** a test notice to this device only */
export async function sendTestPushAction(endpoint: unknown): Promise<ActionResult> {
  await requireAdminAction();
  if (!isPushConfigured()) return fail(OFF);
  if (!isEndpoint(endpoint)) return fail("Neispravan zahtjev. Osvježite stranicu.");

  try {
    const report = await sendPush(TEST_PAYLOAD, { endpoint });
    if (report.sent) return done("Probna obavijest je poslana. Trebala bi stići za nekoliko sekundi.");
    if (report.removed) {
      revalidatePath(PAGE);
      return fail("Ovaj uređaj više ne prima obavijesti. Uključite ih ponovno.");
    }
    if (report.failed) return fail("Slanje nije uspjelo. Pokušajte ponovno za minutu.");
    return fail("Ovaj uređaj nije na popisu. Uključite obavijesti ponovno.");
  } catch (err) {
    console.error(`[admin] probna obavijest nije poslana (${dbErrorLabel(err)})`);
    return fail("Slanje nije uspjelo. Pokušajte ponovno za minutu.");
  }
}

/**
 * "I've seen the quote answers": called when Ponude opens and by "U redu" on the dashboard. Answers
 * up to now stop counting in the menu badge and the dashboard alerts (lib/admin/push.ts quotesSeenSince).
 */
export async function markQuotesSeenAction(): Promise<void> {
  await requireAdminAction();
  (await cookies()).set(QUOTES_SEEN_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 365 * 24 * 60 * 60,
  });
}
