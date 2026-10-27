import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/admin/ui";
import { PushCard } from "@/components/admin/settings/PushCard";
import { listPushSubscriptions, vapidPublicKey } from "@/lib/admin/push";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "./actions";

export const metadata: Metadata = { title: "Obavijesti" };

export default async function NotificationSettingsPage() {
  await requireAdmin();

  const publicKey = vapidPublicKey();
  let endpoints: string[] | null = null;
  if (publicKey) {
    try {
      endpoints = (await listPushSubscriptions()).map((s) => s.endpoint);
    } catch (err) {
      console.error(`[admin] popis uređaja za obavijesti se ne može učitati (${dbErrorLabel(err)})`);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <PushCard
        publicKey={publicKey}
        endpoints={endpoints}
        save={savePushSubscriptionAction}
        remove={removePushSubscriptionAction}
        test={sendTestPushAction}
      />

      <Card aria-labelledby="sto-stize">
        <CardHeader id="sto-stize" title="Što stiže na mobitel" />
        <ul className="space-y-3 text-[13.5px] leading-relaxed text-fg/80">
          <li>
            <strong className="font-medium text-fg">Novi upit</strong> iz 3D studija ili s kontakt forme — s brojem upita, mjestom i
            okvirnom cijenom.
          </li>
          <li>
            <strong className="font-medium text-fg">Odgovor na ponudu</strong> — kupac ju je prihvatio ili odbio putem poveznice, s
            imenom i iznosom.
          </li>
        </ul>
        <div className="mt-6 space-y-2 border-t border-white/[0.06] pt-5 text-[13px] leading-relaxed text-mut">
          <p>
            <span className="text-fg/80">Android:</span> radi u Chromeu odmah. Za vlastitu ikonu na početnom zaslonu odaberite u
            izborniku preglednika „Dodaj na početni zaslon”.
          </p>
          <p>
            <span className="text-fg/80">iPhone:</span> samo kad je EMNA admin dodan na početni zaslon (iOS 16.4 ili noviji).
          </p>
          <p>
            Uključite obavijesti na svakom mobitelu koji ih treba primati. I bez njih broj novih upita i odgovora vidite u izborniku,
            a otvorena administracija se sama osvježava svake minute.
          </p>
        </div>
      </Card>
    </div>
  );
}
