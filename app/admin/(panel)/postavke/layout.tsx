import { PageHeader } from "@/components/admin/ui";
import { SettingsTabs } from "@/components/admin/settings/SettingsTabs";
import { requireAdmin } from "@/lib/auth/session";

/** shared frame of /admin/postavke/*; each page still calls requireAdmin() itself */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader
        eyebrow="Postavke"
        title="Postavke"
        description="Podaci o tvrtki, zadane vrijednosti za ponude, obavijesti na mobitel i tko smije u administraciju."
        className="mb-6 sm:mb-8"
      />
      <SettingsTabs />
      {children}
    </>
  );
}
