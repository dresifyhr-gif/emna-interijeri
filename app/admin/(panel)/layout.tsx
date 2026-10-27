import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { Shell } from "@/components/admin/Shell";
import { QUOTES_SEEN_COOKIE, answeredQuotesSince, quotesSeenSince } from "@/lib/admin/push";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";

/**
 * Authenticated admin frame. NOTE: layouts are not re-rendered on client-side navigation,
 * so every page (and every server action / route handler) under here must call requireAdmin()
 * (or requireAdminAction() / requireAdminApi()) itself — this check is only the first line.
 *
 * Badges: inquiries with status "novi", and quotes the customer answered since this browser last
 * opened Ponude (cookie, lib/admin/push.ts). Shell's AutoRefresh re-renders them every minute.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const since = quotesSeenSince((await cookies()).get(QUOTES_SEEN_COOKIE)?.value);

  const badges = { upiti: 0, ponude: 0 };
  try {
    const [[newLeads], answered] = await Promise.all([
      getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.status, "novi")),
      answeredQuotesSince(since, 100),
    ]);
    badges.upiti = Number(newLeads?.n ?? 0);
    badges.ponude = answered.length;
  } catch {
    /* the badges are optional; pages report DB problems themselves */
  }

  return (
    <Shell username={admin.username} badges={badges}>
      {children}
    </Shell>
  );
}
