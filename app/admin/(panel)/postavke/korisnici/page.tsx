import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Alert, Badge, Card, CardHeader } from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/leads/ConfirmDialog";
import { AddUserForm } from "@/components/admin/settings/AddUserForm";
import { ChangePasswordForm } from "@/components/admin/settings/ChangePasswordForm";
import { formatDate, formatRelative } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel, getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { addAdminUserAction, changePasswordAction, removeAdminUserAction } from "../actions";

export const metadata: Metadata = { title: "Korisnici" };

async function listUsers() {
  return getDb()
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      createdAt: adminUsers.createdAt,
      lastLoginAt: adminUsers.lastLoginAt,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));
}

export default async function UsersSettingsPage() {
  const admin = await requireAdmin();

  let users: Awaited<ReturnType<typeof listUsers>> | null = null;
  try {
    users = await listUsers();
  } catch (err) {
    console.error(`[admin] korisnici se ne mogu učitati (${dbErrorLabel(err)})`);
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card aria-labelledby="administratori">
          <CardHeader
            id="administratori"
            title="Administratori"
            description="Svi imaju jednak, puni pristup. Ukloniti možete svakoga osim sebe."
          />
          {!users ? (
            <Alert tone="danger">Popis se trenutno ne može učitati. Osvježite stranicu za minutu.</Alert>
          ) : (
            <>
              <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07]">
                {users.map((u) => {
                  const me = u.id === admin.userId;
                  return (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-display text-[13px] font-medium text-accent"
                        >
                          {(u.username[0] ?? "?").toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[14px] font-medium text-fg">
                            <span className="truncate">{u.username}</span>
                            {me && (
                              <Badge tone="accent" dot={false}>
                                Vi
                              </Badge>
                            )}
                          </p>
                          <p className="text-[12px] text-mut">
                            Dodan {formatDate(u.createdAt)} ·{" "}
                            {u.lastLoginAt ? `zadnja prijava ${formatRelative(u.lastLoginAt)}` : "još se nije prijavio"}
                          </p>
                        </div>
                      </div>
                      {!me && users.length > 1 && (
                        <ConfirmDialog
                          triggerLabel="Ukloni"
                          triggerVariant="ghost"
                          triggerAriaLabel={`Ukloni administratora ${u.username}`}
                          title={`Ukloniti administratora „${u.username}“?`}
                          description={
                            <>
                              <p>Odmah se odjavljuje sa svih uređaja i više se ne može prijaviti.</p>
                              <p>Upiti, ponude i bilješke ostaju. Ako se predomislite, dodajte ga ponovno s novom lozinkom.</p>
                            </>
                          }
                          confirmLabel="Da, ukloni"
                          pendingLabel="Uklanjam…"
                          action={removeAdminUserAction}
                          fields={{ id: u.id }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {users.length === 1 && (
                <p className="mt-4 text-[12.5px] leading-relaxed text-mut">
                  Vi ste jedini administrator. Lozinka se ne može obnoviti e-mailom, pa je dobro dodati još jednu osobu od
                  povjerenja: ako netko zaboravi lozinku, drugi ga ukloni i ponovno doda s novom.
                </p>
              )}
            </>
          )}
        </Card>

        <Card aria-labelledby="vasa-lozinka">
          <CardHeader id="vasa-lozinka" title="Vaša lozinka" description={`Prijavljeni ste kao ${admin.username}.`} />
          <ChangePasswordForm username={admin.username} action={changePasswordAction} />
        </Card>
      </div>

      <Card aria-labelledby="novi-administrator">
        <CardHeader
          id="novi-administrator"
          title="Dodaj administratora"
          description="Npr. za kolegu u radionici ili osobu koja odgovara na upite."
        />
        <AddUserForm action={addAdminUserAction} />
      </Card>
    </div>
  );
}
