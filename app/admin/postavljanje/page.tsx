import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AuthFrame, buttonClass } from "@/components/admin/ui";
import { isAdminConfigured } from "@/lib/auth/session";
import { adminExists, isSetupTokenConfigured, isValidSetupCode } from "@/lib/auth/setup";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Postavljanje" };

const toLogin = (
  <Link href="/admin/prijava" className={buttonClass("primary", "md", "w-full")}>
    Na prijavu
  </Link>
);

/**
 * First-run setup. Shows the form only while no admin exists AND ?kod= matches ADMIN_SETUP_TOKEN;
 * the action re-checks both (and creates the user atomically).
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const code = typeof sp.kod === "string" ? sp.kod : "";

  let body: React.ReactNode;
  if (!isAdminConfigured() || !isSetupTokenConfigured()) {
    body = (
      <Alert tone="warning" title="Postavljanje nije dostupno.">
        Na poslužitelju nedostaju postavke administracije.
      </Alert>
    );
  } else {
    let exists: boolean | null;
    try {
      exists = await adminExists();
    } catch {
      exists = null;
    }
    if (exists === null) {
      body = (
        <Alert tone="danger" title="Baza podataka trenutno ne odgovara.">
          Osvježite stranicu za minutu.
        </Alert>
      );
    } else if (exists) {
      body = (
        <div className="space-y-5">
          <Alert tone="info" title="Administracija je već postavljena.">
            Prijavite se svojim korisničkim imenom i lozinkom.
          </Alert>
          {toLogin}
        </div>
      );
    } else if (!isValidSetupCode(code)) {
      body = (
        <Alert tone="warning" title="Poveznica nije ispravna.">
          Za postavljanje otvorite točnu poveznicu koju ste dobili — kod mora biti cijeli, bez razmaka.
        </Alert>
      );
    } else {
      body = <SetupForm code={code} />;
    }
  }

  return (
    <AuthFrame
      eyebrow="Prvo pokretanje"
      title="Postavljanje"
      description="Odaberite korisničko ime i lozinku za administraciju. To radite samo jednom."
      footer={
        <Link href="/" className="transition-colors hover:text-fg">
          ← Natrag na stranicu
        </Link>
      }
    >
      {body}
    </AuthFrame>
  );
}
