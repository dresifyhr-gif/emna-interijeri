import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AuthFrame } from "@/components/admin/ui";
import { safeAdminNext } from "@/lib/auth/request";
import { getSession, isAdminConfigured } from "@/lib/auth/session";
import { adminExists } from "@/lib/auth/setup";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Prijava" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeAdminNext(typeof sp.next === "string" ? sp.next : null);

  if (await getSession()) redirect(next);

  const configured = isAdminConfigured();
  let hasAdmin: boolean | null = null;
  if (configured) {
    try {
      hasAdmin = await adminExists();
    } catch {
      hasAdmin = null; // DB hiccup: still show the form, the action reports problems
    }
  }

  return (
    <AuthFrame
      eyebrow="Administracija"
      title="Prijava"
      description="Upiti, ponude i postavke tvrtke — samo za EMNA."
      footer={
        <Link href="/" className="transition-colors hover:text-fg">
          ← Natrag na stranicu
        </Link>
      }
    >
      {!configured ? (
        <Alert tone="warning" title="Administracija još nije podešena.">
          Na poslužitelju nedostaju postavke (baza podataka ili tajni ključ sesije).
        </Alert>
      ) : (
        <div className="space-y-5">
          {hasAdmin === false && (
            <Alert tone="info" title="Administrator još nije postavljen.">
              Otvorite poveznicu za postavljanje koju ste dobili (…/admin/postavljanje?kod=…).
            </Alert>
          )}
          <LoginForm next={next} disabled={hasAdmin === false} />
        </div>
      )}
    </AuthFrame>
  );
}
