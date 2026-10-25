"use client";

import { Alert, Button, PageHeader } from "@/components/admin/ui";

/** errors thrown by a panel page render inside the shell, with a retry */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.name === "AdminForbiddenError";
  return (
    <>
      <PageHeader eyebrow="Greška" title={forbidden ? "Zahtjev nije dopušten." : "Nešto je pošlo po zlu."} />
      <Alert tone="danger" title={forbidden ? "Radnja je odbijena iz sigurnosnih razloga." : "Stranica se nije mogla prikazati."}>
        {forbidden
          ? "Osvježite stranicu i pokušajte ponovno."
          : "Pokušajte ponovno. Ako se greška ponavlja, zapišite vrijeme i javite ga razvoju."}
        {error.digest && <span className="mt-2 block text-[12px] text-mut">Oznaka greške: {error.digest}</span>}
      </Alert>
      <div className="mt-6">
        <Button onClick={reset}>Pokušaj ponovno</Button>
      </div>
    </>
  );
}
