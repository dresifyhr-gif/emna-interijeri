import { eq, sql } from "drizzle-orm";
import { Shell } from "@/components/admin/Shell";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";

/**
 * Authenticated admin frame. NOTE: layouts are not re-rendered on client-side navigation,
 * so every page (and every server action / route handler) under here must call requireAdmin()
 * (or requireAdminAction() / requireAdminApi()) itself — this check is only the first line.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  let newLeads = 0;
  try {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.status, "novi"));
    newLeads = Number(row?.n ?? 0);
  } catch {
    /* the badge is optional; pages report DB problems themselves */
  }

  return (
    <Shell username={admin.username} badges={{ upiti: newLeads }}>
      {children}
    </Shell>
  );
}
