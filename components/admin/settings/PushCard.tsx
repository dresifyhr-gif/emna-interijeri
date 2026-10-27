"use client";

/**
 * Postavke → Obavijesti: switch Web Push on or off for this device and send a test notice.
 * Registers public/admin-sw.js (scope /admin) and subscribes with the server's public VAPID key; the
 * subscription is stored through the server actions in app/admin/(panel)/postavke/obavijesti/actions.ts.
 *
 * iPhone: push exists only in the app added to the home screen (iOS 16.4+), so in Safari the card shows those steps.
 * The browser's permission prompt may only come from a tap, so requestPermission() runs first in the click handler.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Card, CardHeader, cx } from "@/components/admin/ui";
import type { ActionResult } from "@/components/admin/leads/types";
import { plural } from "@/lib/admin/format";

const SW_URL = "/admin-sw.js";
// no trailing slash: the dashboard /admin (the "Pregled" tab, the fallback of a notice) is in the scope too
const SW_SCOPE = "/admin";

type Device = "checking" | "ready" | "ios-browser" | "unsupported";
type Busy = "on" | "off" | "test" | null;

const failed = (message: string): ActionResult => ({ ok: false, message, at: Date.now() });

function isIos(): boolean {
  // iPadOS reports itself as a Mac, but with touch
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function canPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** base64url VAPID key → the bytes pushManager.subscribe() wants */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** the admin's service worker, registered and active (subscribe() needs an active worker) */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  const worker = reg.installing ?? reg.waiting;
  if (!reg.active && worker) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (worker.state === "activated" || worker.state === "redundant") resolve();
      };
      worker.addEventListener("statechange", check);
      check();
    });
  }
  return reg;
}

function StatusLine({ tone, children }: { tone: "on" | "off" | "wait"; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px] font-medium text-fg">
      <span
        aria-hidden
        className={cx(
          "mt-[7px] h-2 w-2 shrink-0 rounded-full",
          tone === "on" ? "bg-emerald-300" : tone === "off" ? "bg-amber-300" : "bg-white/25",
        )}
      />
      <span>{children}</span>
    </p>
  );
}

export function PushCard({
  publicKey,
  endpoints,
  save,
  remove,
  test,
}: {
  /** VAPID public key; null = push is not switched on on the server */
  publicKey: string | null;
  /** endpoints the server knows (null = the list couldn't be read) */
  endpoints: string[] | null;
  save: (subscription: unknown) => Promise<ActionResult>;
  remove: (endpoint: string) => Promise<ActionResult>;
  test: (endpoint: string) => Promise<ActionResult>;
}) {
  const [device, setDevice] = useState<Device>("checking");
  const [ios, setIos] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  /** this browser's current subscription */
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    void (async () => {
      const onIos = isIos();
      let next: Device = "unsupported";
      let current: string | null = null;
      let allowed: NotificationPermission = "default";
      if (canPush()) {
        allowed = Notification.permission;
        const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(() => null);
        current = (await reg?.pushManager.getSubscription().catch(() => null))?.endpoint ?? null;
        next = "ready";
      } else if (onIos && !isStandalone()) {
        next = "ios-browser";
      }
      if (cancelled) return;
      setIos(onIos);
      setPermission(allowed);
      setEndpoint(current);
      setDevice(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey || busy) return;
    setBusy("on");
    setResult(null);
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") {
        setResult(failed(answer === "denied" ? "Obavijesti su blokirane za ovu stranicu." : "Obavijesti niste dopustili. Pokušajte ponovno."));
        return;
      }
      const reg = await activeRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, publicKey)) {
        // made with an older key: the server can't reach it any more
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await save(sub.toJSON());
      setResult(res);
      if (res.ok) setEndpoint(sub.endpoint);
    } catch {
      setResult(failed("Uključivanje nije uspjelo. Pokušajte ponovno; ako se ponavlja, osvježite stranicu."));
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy("off");
    setResult(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const sub = await reg?.pushManager.getSubscription();
      const target = sub?.endpoint ?? endpoint;
      const res = target ? await remove(target) : null;
      // off on this device in any case; a leftover entry on the server is dropped on the next send
      await sub?.unsubscribe().catch(() => false);
      setEndpoint(null);
      setResult(res ?? { ok: true, message: "Obavijesti su isključene na ovom uređaju.", at: Date.now() });
    } catch {
      setResult(failed("Isključivanje nije uspjelo. Pokušajte ponovno."));
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!endpoint || busy) return;
    setBusy("test");
    setResult(null);
    try {
      setResult(await test(endpoint));
    } catch {
      setResult(failed("Slanje nije uspjelo. Pokušajte ponovno za minutu."));
    } finally {
      setBusy(null);
    }
  }

  // subscribed in this browser and known to the server (when the server list could be read)
  const subscribed = endpoint !== null && (endpoints === null || endpoints.includes(endpoint));
  const blocked = permission === "denied";
  const canEnable = Boolean(publicKey) && device === "ready" && !blocked;

  let status: ReactNode;
  if (!publicKey) {
    status = (
      <>
        <StatusLine tone="off">Obavijesti još nisu uključene na poslužitelju.</StatusLine>
        <p className="mt-2 text-[13px] leading-relaxed text-mut">
          Uključuje ih razvoj, jednom za sve uređaje. Nakon toga ih ovdje palite jednim dodirom. Dotad nove upite i odgovore na
          ponude vidite u izborniku i na Pregledu.
        </p>
      </>
    );
  } else if (device === "checking") {
    status = <StatusLine tone="wait">Provjeravam ovaj uređaj…</StatusLine>;
  } else if (device === "ios-browser") {
    status = (
      <>
        <StatusLine tone="off">Na iPhoneu obavijesti rade samo s početnog zaslona.</StatusLine>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-fg/80 marker:text-accent">
          <li>
            U Safariju dodirnite <strong className="font-medium text-fg">Podijeli</strong> (kvadrat sa strelicom prema gore). Na
            novijim iPhoneima najprije dodirnite <strong className="font-medium text-fg">•••</strong> pa Podijeli.
          </li>
          <li>
            Pomaknite se prema dolje i odaberite <strong className="font-medium text-fg">Dodaj na početni zaslon</strong>.
          </li>
          <li>
            Otvorite <strong className="font-medium text-fg">EMNA admin</strong> s početnog zaslona, prijavite se i ovdje uključite
            obavijesti.
          </li>
        </ol>
        <p className="mt-2 text-[12.5px] text-mut">Treba iOS 16.4 ili noviji.</p>
      </>
    );
  } else if (device === "unsupported") {
    status = (
      <>
        <StatusLine tone="off">Ovaj preglednik ne prima obavijesti.</StatusLine>
        <p className="mt-2 text-[13px] leading-relaxed text-mut">
          {ios
            ? "Na iPhoneu treba iOS 16.4 ili noviji. Ažurirajte iOS pa otvorite EMNA admin s početnog zaslona."
            : "Na Android mobitelu otvorite administraciju u Chromeu, a na računalu u Chromeu, Edgeu, Firefoxu ili Safariju."}
        </p>
      </>
    );
  } else if (blocked) {
    status = (
      <>
        <StatusLine tone="off">Obavijesti su blokirane za ovu stranicu.</StatusLine>
        <p className="mt-2 text-[13px] leading-relaxed text-mut">
          {ios
            ? "Dopustite ih u Postavkama iPhonea: Obavijesti → EMNA admin. Zatim se vratite ovdje."
            : "Dopustite ih u postavkama preglednika (ikona pokraj adrese stranice → Obavijesti), zatim osvježite stranicu."}
        </p>
      </>
    );
  } else if (subscribed) {
    status = <StatusLine tone="on">Ovaj uređaj prima obavijesti.</StatusLine>;
  } else {
    status = <StatusLine tone="wait">Ovaj uređaj još ne prima obavijesti.</StatusLine>;
  }

  const others = endpoints?.filter((e) => e !== endpoint).length ?? 0;

  return (
    <Card aria-labelledby="obavijesti-uredaj">
      <CardHeader
        id="obavijesti-uredaj"
        title="Obavijesti na ovom uređaju"
        description="Novi upit ili odgovor kupca na ponudu stiže na mobitel kao poruka. Dodir na nju otvara upit ili ponudu."
      />

      <div className="rounded-xl border border-white/[0.07] px-4 py-4">{status}</div>

      {result?.message && (
        <Alert tone={result.ok ? "success" : "danger"} className="mt-4">
          {result.message}
        </Alert>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {subscribed && !blocked && publicKey && device === "ready" ? (
          <>
            <Button variant="primary" loading={busy === "test"} disabled={busy !== null} onClick={sendTest}>
              Pošalji probnu obavijest
            </Button>
            <Button variant="ghost" loading={busy === "off"} disabled={busy !== null} onClick={disable}>
              Isključi
            </Button>
          </>
        ) : (
          <Button variant="primary" loading={busy === "on"} disabled={!canEnable || busy !== null} onClick={enable}>
            Uključi obavijesti na ovom uređaju
          </Button>
        )}
      </div>

      {publicKey && endpoints !== null && (subscribed || others > 0) && (
        <p className="mt-4 text-[12.5px] text-mut">
          {subscribed
            ? others > 0
              ? `Uključeno i na još ${others} ${plural(others, "uređaju", "uređaja", "uređaja")}.`
              : "Ovo je jedini uređaj s uključenim obavijestima."
            : `Uključeno na ${others} ${plural(others, "drugom uređaju", "druga uređaja", "drugih uređaja")}.`}
        </p>
      )}
    </Card>
  );
}
