/**
 * Owner notifications (lib/admin/push.ts) without a database or network: what a browser subscription must look like,
 * the stored list (dedupe by endpoint, cap, one bad entry never costs the others), the notice texts for a new inquiry
 * and a quote answer (missing city / price left out), the VAPID env check, the "new answers" cookie and the
 * service worker contract (only admin pages open from a notification).
 *
 *   npx tsx --test lib/admin/push.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import webpush from "web-push";
import {
  MAX_PUSH_SUBSCRIPTIONS,
  QUOTES_SEEN_FALLBACK_DAYS,
  isPushConfigured,
  leadPayload,
  normalizeSubscription,
  quoteAnswerPayload,
  quotesSeenSince,
  readSubscriptions,
  removeEndpoint,
  upsertSubscription,
  vapidPublicKey,
  type StoredPushSubscription,
} from "./push";

const KEYS = {
  // the browser's format: 65-byte P-256 public key and 16-byte auth secret, base64url
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const FCM = "https://fcm.googleapis.com/fcm/send/abc123:APA91bH";
const APPLE = "https://web.push.apple.com/QGuQyavXutnMH8kwSJN2";

const stored = (endpoint: string, createdAt = "2026-10-27T08:00:00.000Z"): StoredPushSubscription => ({
  endpoint,
  keys: KEYS,
  userId: "6f1c7e0a-2b9d-4c51-9a3e-0d4b8f2c1a77",
  ua: "Mozilla/5.0 (iPhone)",
  createdAt,
});

describe("normalizeSubscription", () => {
  it("keeps endpoint and keys of a real browser subscription, drops the rest", () => {
    const sub = normalizeSubscription({ endpoint: FCM, expirationTime: null, keys: { ...KEYS, extra: "x" } });
    assert.deepEqual(sub, { endpoint: FCM, keys: KEYS });
    assert.deepEqual(normalizeSubscription({ endpoint: APPLE, keys: KEYS }), { endpoint: APPLE, keys: KEYS });
    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
      "https://wns2-db5p.notify.windows.com/w/?token=BQYAAA",
      "https://api.push.apple.com/3/device/abc",
    ]) {
      assert.ok(normalizeSubscription({ endpoint, keys: KEYS }), endpoint);
    }
  });

  it("refuses anything that isn't a public https push endpoint", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://[::1]/push",
      "https://10.0.0.8/push",
      "https://localhost./x",
      "https://127.0.0.1.nip.io/x",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://fcm.googleapis.com.evil.example/x",
      "https://pushapple.com/x",
      "https://fcm.googleapis.com:8443/fcm/send/x",
      "https://user:pass@fcm.googleapis.com/fcm/send/x",
      "javascript:alert(1)",
      "nije poveznica",
      `https://fcm.googleapis.com/${"a".repeat(1000)}`,
    ]) {
      assert.equal(normalizeSubscription({ endpoint, keys: KEYS }), null, endpoint);
    }
  });

  it("refuses missing or malformed keys", () => {
    assert.equal(normalizeSubscription({ endpoint: FCM }), null);
    assert.equal(normalizeSubscription({ endpoint: FCM, keys: { p256dh: KEYS.p256dh } }), null);
    assert.equal(normalizeSubscription({ endpoint: FCM, keys: { p256dh: "kratko", auth: KEYS.auth } }), null);
    assert.equal(normalizeSubscription({ endpoint: FCM, keys: { p256dh: `${KEYS.p256dh}+/`, auth: KEYS.auth } }), null);
    assert.equal(normalizeSubscription({ endpoint: FCM, keys: { p256dh: KEYS.p256dh, auth: "a".repeat(101) } }), null);
    assert.equal(normalizeSubscription(null), null);
    assert.equal(normalizeSubscription("x"), null);
  });
});

describe("the stored list", () => {
  it("reads only valid entries and survives garbage", () => {
    assert.deepEqual(readSubscriptions(null), []);
    assert.deepEqual(readSubscriptions({ endpoint: FCM }), []);
    const good = stored(FCM);
    assert.deepEqual(readSubscriptions([good, { endpoint: "https://localhost/x", keys: KEYS }, 7, null]), [good]);
    // an odd user agent is forgotten, the device is kept
    assert.deepEqual(readSubscriptions([{ ...good, ua: 42 }]), [{ ...good, ua: null }]);
  });

  it("upsert replaces the same endpoint and puts it last", () => {
    const a = stored(FCM);
    const b = stored(APPLE);
    const a2 = stored(FCM, "2026-10-28T09:00:00.000Z");
    const list = upsertSubscription(upsertSubscription(upsertSubscription([], a), b), a2);
    assert.deepEqual(list, [b, a2]);
  });

  it(`keeps at most ${MAX_PUSH_SUBSCRIPTIONS} devices, dropping the oldest`, () => {
    let list: StoredPushSubscription[] = [];
    for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS + 3; i++) list = upsertSubscription(list, stored(`${FCM}-${i}`));
    assert.equal(list.length, MAX_PUSH_SUBSCRIPTIONS);
    assert.equal(list[0].endpoint, `${FCM}-3`);
    assert.equal(list.at(-1)?.endpoint, `${FCM}-${MAX_PUSH_SUBSCRIPTIONS + 2}`);
  });

  it("removeEndpoint removes only that device", () => {
    const list = [stored(FCM), stored(APPLE)];
    assert.deepEqual(removeEndpoint(list, FCM), [stored(APPLE)]);
    assert.deepEqual(removeEndpoint(list, "https://nepoznat.example/x"), list);
  });
});

describe("notice texts", () => {
  const id = "3c1f0f7e-5d2a-4a8b-9b61-2f0e4c6d8a10";

  it("a studio inquiry: source, city and price range", () => {
    assert.deepEqual(leadPayload({ id, number: "U-2026-0007", source: "studio", city: " Zagreb ", priceLow: 8400, priceHigh: 9100 }), {
      title: "Novi upit U-2026-0007",
      body: "3D studio · Zagreb · 8.400 – 9.100 €",
      url: `/admin/upiti/${id}`,
      tag: `upit-${id}`,
    });
  });

  it("leaves out a missing city and price", () => {
    assert.equal(leadPayload({ id, number: "U-2026-0008", source: "kontakt" }).body, "Kontakt forma");
    assert.equal(leadPayload({ id, number: "U-2026-0008", source: "kontakt", city: "   ", priceLow: null }).body, "Kontakt forma");
    assert.equal(leadPayload({ id, number: "U-2026-0009", source: "studio", priceLow: 8400, priceHigh: 8400 }).body, "3D studio · 8.400 €");
    assert.equal(leadPayload({ id, number: "U-2026-0009", source: "studio", city: "Split", priceLow: 0, priceHigh: NaN }).body, "3D studio · Split");
    assert.equal(leadPayload({ id, number: "U-2026-0009", source: "drugo", city: "Split" }).body, "Split");
  });

  it("a quote answer: accepted or rejected, customer and total in whole euros", () => {
    assert.deepEqual(quoteAnswerPayload({ id, number: "P-2026-0003", accepted: true, customerName: "Ivan Horvat", totalCents: 924_000 }), {
      title: "Ponuda P-2026-0003 je prihvaćena",
      body: "Ivan Horvat · 9.240 €",
      url: `/admin/ponude/${id}`,
      tag: `ponuda-${id}`,
    });
    const rejected = quoteAnswerPayload({ id, number: "P-2026-0004", accepted: false, customerName: "Ana Kovač", totalCents: 0 });
    assert.equal(rejected.title, "Ponuda P-2026-0004 je odbijena");
    assert.equal(rejected.body, "Ana Kovač");
    assert.equal(quoteAnswerPayload({ id, number: "P-2026-0005", accepted: true, customerName: null, totalCents: 123_456 }).body, "1.235 €");
  });
});

describe("VAPID keys", () => {
  const ENV = ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;
  const withEnv = (values: Partial<Record<(typeof ENV)[number], string>>, fn: () => void) => {
    const saved = ENV.map((k) => process.env[k]);
    for (const k of ENV) delete process.env[k];
    Object.assign(process.env, values);
    try {
      fn();
    } finally {
      ENV.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    }
  };
  const keys = webpush.generateVAPIDKeys();

  it("is off until all three values are there and well-formed", () => {
    withEnv({}, () => {
      assert.equal(isPushConfigured(), false);
      assert.equal(vapidPublicKey(), null);
    });
    withEnv({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, () => assert.equal(isPushConfigured(), false));
    withEnv({ VAPID_SUBJECT: "emna-interijeri.vercel.app", VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, () =>
      assert.equal(isPushConfigured(), false),
    );
    withEnv({ VAPID_SUBJECT: "https://emna-interijeri.vercel.app", VAPID_PUBLIC_KEY: keys.privateKey, VAPID_PRIVATE_KEY: keys.publicKey }, () =>
      assert.equal(isPushConfigured(), false),
    );
  });

  it("is on with generated keys and hands out only the public one", () => {
    withEnv({ VAPID_SUBJECT: "https://emna-interijeri.vercel.app", VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: ` ${keys.privateKey}\n` }, () => {
      assert.equal(isPushConfigured(), true);
      assert.equal(vapidPublicKey(), keys.publicKey);
    });
    withEnv({ VAPID_SUBJECT: "mailto:vlasnik@example.com", VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, () =>
      assert.equal(isPushConfigured(), true),
    );
  });
});

describe("new quote answers since the last look", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const fallback = new Date(now.getTime() - QUOTES_SEEN_FALLBACK_DAYS * 24 * 3600 * 1000);

  it("uses the cookie time", () => {
    assert.equal(quotesSeenSince("2026-10-25T07:30:00.000Z", now).toISOString(), "2026-10-25T07:30:00.000Z");
  });

  it("falls back to the last 14 days without a usable cookie", () => {
    for (const v of [undefined, null, "", "jučer", "1700000000000", "2026-13-45T99:00:00Z"]) {
      assert.equal(quotesSeenSince(v, now).getTime(), fallback.getTime(), String(v));
    }
  });

  it("a cookie from the future never hides answers", () => {
    assert.equal(quotesSeenSince("2027-01-01T00:00:00.000Z", now).getTime(), now.getTime());
  });
});

describe("service worker and manifest (public/)", () => {
  const root = join(__dirname, "..", "..", "public");
  const sw = readFileSync(join(root, "admin-sw.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(root, "admin.webmanifest"), "utf8")) as Record<string, unknown>;
  const ORIGIN = "https://emna-interijeri.vercel.app";

  /** runs public/admin-sw.js against a fake `self` and fires its events */
  function worker() {
    const listeners = new Map<string, (event: object) => void>();
    const shown: { title: string; options: { body: string; icon: string; tag?: string; data: { url: string } } }[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: ORIGIN },
      navigator: {},
      registration: {
        showNotification: async (title: string, options: (typeof shown)[number]["options"]) => void shown.push({ title, options }),
        getNotifications: async () => [],
      },
      clients: {
        claim: async () => {},
        matchAll: async () => [],
        openWindow: async (url: string) => void opened.push(url),
      },
      skipWaiting: () => {},
      addEventListener: (type: string, fn: (event: object) => void) => listeners.set(type, fn),
    };
    runInNewContext(sw, { self, URL });
    const fire = async (type: string, event: object) => {
      let done: unknown;
      listeners.get(type)?.({ ...event, waitUntil: (p: unknown) => (done = p) });
      await done;
    };
    return { listeners, shown, opened, fire };
  }
  const pushEvent = (data: unknown) => ({ data: { json: () => data, text: () => JSON.stringify(data) } });

  it("shows the notice from the payload and has no fetch handler", async () => {
    const w = worker();
    assert.deepEqual([...w.listeners.keys()].sort(), ["activate", "install", "notificationclick", "notificationclose", "push"]);
    await w.fire("push", pushEvent(leadPayload({ id: "abc", number: "U-2026-0007", source: "studio", city: "Zagreb" })));
    assert.equal(w.shown[0].title, "Novi upit U-2026-0007");
    assert.equal(w.shown[0].options.body, "3D studio · Zagreb");
    assert.equal(w.shown[0].options.icon, "/admin-icon-192.png");
    assert.equal(w.shown[0].options.tag, "upit-abc");
    assert.equal(w.shown[0].options.data.url, `${ORIGIN}/admin/upiti/abc`);
  });

  it("opens admin pages only", async () => {
    for (const [url, expected] of [
      ["/admin/ponude/1", `${ORIGIN}/admin/ponude/1`],
      ["https://zlo.example/admin", `${ORIGIN}/admin`],
      ["/kontakt", `${ORIGIN}/admin`],
      ["/administracija", `${ORIGIN}/admin`],
      [undefined, `${ORIGIN}/admin`],
    ] as const) {
      const w = worker();
      await w.fire("push", pushEvent({ title: "x", url }));
      await w.fire("notificationclick", { notification: { close: () => {}, data: w.shown[0].options.data } });
      assert.deepEqual(w.opened, [expected], String(url));
    }
  });

  it("survives a payload that isn't JSON", async () => {
    const w = worker();
    await w.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("x");
        },
        text: () => "samo tekst",
      },
    });
    assert.equal(w.shown[0].title, "EMNA admin");
    assert.equal(w.shown[0].options.body, "samo tekst");
  });

  it("the manifest installs only the admin, the dashboard /admin included", () => {
    assert.equal(manifest.scope, "/admin");
    assert.equal(manifest.start_url, "/admin/upiti");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.short_name, "EMNA");
    const icons = manifest.icons as { src: string; sizes: string }[];
    assert.deepEqual([...new Set(icons.map((i) => i.sizes))], ["192x192", "512x512"]);
  });
});
