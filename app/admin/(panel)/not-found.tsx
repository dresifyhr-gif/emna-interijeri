import { EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";

/** notFound() from any panel page (e.g. an unknown upit / ponuda id) */
export default function PanelNotFound() {
  return (
    <>
      <PageHeader eyebrow="404" title="Ovo ne postoji." />
      <EmptyState
        title="Zapis nije pronađen."
        description="Možda je obrisan ili je poveznica nepotpuna."
        action={
          <>
            <LinkButton href="/admin/upiti" size="sm">
              Upiti
            </LinkButton>
            <LinkButton href="/admin/ponude" size="sm">
              Ponude
            </LinkButton>
          </>
        }
      />
    </>
  );
}
