import type { Metadata } from "next";
import { Alert } from "@/components/admin/ui";
import { CompanyForm } from "@/components/admin/settings/CompanyForm";
import { companyToFormValues } from "@/components/admin/settings/company-fields";
import {
  SETTING_KEYS,
  companyCompleteness,
  getSettingUpdatedAt,
  getStoredCompanySettings,
  withSiteFallback,
  type CompanySettings,
} from "@/lib/admin/settings";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { saveCompanyAction } from "./actions";

export const metadata: Metadata = { title: "Podaci o tvrtki" };

export default async function CompanySettingsPage() {
  await requireAdmin();

  let company: CompanySettings | null = null;
  let updatedAt: Date | null = null;
  try {
    [company, updatedAt] = await Promise.all([getStoredCompanySettings(), getSettingUpdatedAt(SETTING_KEYS.company)]);
  } catch (err) {
    console.error(`[admin] podaci o tvrtki se ne mogu učitati (${dbErrorLabel(err)})`);
  }

  if (!company) {
    return (
      <Alert tone="danger" title="Podaci se trenutno ne mogu učitati.">
        Baza podataka ne odgovara. Osvježite stranicu za minutu.
      </Alert>
    );
  }

  // stored value, else what lib/site.ts already has (so saving never wipes a known fact)
  const effective = withSiteFallback(company);
  const { filled, total, missingCore } = companyCompleteness(effective);

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Ovi se podaci za sada spremaju samo u administraciju.">
        Javna stranica (kontakt, podnožje, O nama, politika privatnosti) povezuje se s njima u sljedećem koraku — do tada
        prikazuje podatke upisane u kod. Upisujte samo stvarne podatke; prazno polje se nigdje ne prikazuje.
      </Alert>

      <p className="text-[12.5px] text-mut">
        Upisano <span className="tabular-nums text-fg/85">{filled}</span> od <span className="tabular-nums">{total}</span> polja
        {missingCore.length > 0
          ? ". Za ponude najviše nedostaju telefon, e-mail, adresa, grad, naziv i OIB."
          : " — sve što ponude trebaju je tu."}
      </p>

      <CompanyForm
        initial={companyToFormValues(effective)}
        updatedAt={updatedAt ? updatedAt.toISOString() : null}
        action={saveCompanyAction}
      />
    </div>
  );
}
