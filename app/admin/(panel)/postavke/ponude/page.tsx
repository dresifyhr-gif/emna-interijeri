import type { Metadata } from "next";
import { Alert } from "@/components/admin/ui";
import { QuoteDefaultsForm } from "@/components/admin/settings/QuoteDefaultsForm";
import { QUOTE_TEXT_MAX, SETTING_KEYS, getQuoteDefaults, getSettingUpdatedAt, type QuoteDefaults } from "@/lib/admin/settings";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { saveQuoteDefaultsAction } from "../actions";

export const metadata: Metadata = { title: "Postavke ponuda" };

const zagrebDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" });

/** 25 → "25", 13.5 → "13,5" (as the owner would type it) */
const pctText = (n: number) => String(n).replace(".", ",");

export default async function QuoteSettingsPage() {
  await requireAdmin();

  let defaults: QuoteDefaults | null = null;
  let updatedAt: Date | null = null;
  try {
    [defaults, updatedAt] = await Promise.all([getQuoteDefaults(), getSettingUpdatedAt(SETTING_KEYS.quoteDefaults)]);
  } catch (err) {
    console.error(`[admin] postavke ponuda se ne mogu učitati (${dbErrorLabel(err)})`);
  }

  if (!defaults) {
    return (
      <Alert tone="danger" title="Postavke se trenutno ne mogu učitati.">
        Baza podataka ne odgovara. Osvježite stranicu za minutu.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {!updatedAt && (
        <Alert tone="info" title="Još niste spremili postavke ponuda.">
          Dok ih ne spremite, nove ponude kreću s PDV-om od 25 % i rokom od 30 dana, bez uvjeta plaćanja i napomene.
        </Alert>
      )}
      <QuoteDefaultsForm
        initial={{
          vatPct: pctText(defaults.vatPct),
          validDays: String(defaults.validDays),
          terms: defaults.terms ?? "",
          notes: defaults.notes ?? "",
        }}
        todayIso={zagrebDate.format(new Date())}
        textMax={QUOTE_TEXT_MAX}
        updatedAt={updatedAt ? updatedAt.toISOString() : null}
        action={saveQuoteDefaultsAction}
      />
    </div>
  );
}
