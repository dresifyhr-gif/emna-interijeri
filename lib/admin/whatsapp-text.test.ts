/**
 * The owner's ready-made messages (lib/admin/whatsapp-text.ts): phone numbers for wa.me / sms:, the reply to an
 * inquiry and the quote's message.
 *
 *   npx tsx --test lib/admin/whatsapp-text.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadReplyText, quoteText, smsHref, toWhatsappDigits, whatsappHref } from "./whatsapp-text";

describe("toWhatsappDigits", () => {
  it("gives Croatian numbers typed the local way the country code", () => {
    assert.equal(toWhatsappDigits("091 123 4567"), "385911234567");
    assert.equal(toWhatsappDigits("098/765-432"), "38598765432");
    assert.equal(toWhatsappDigits("(095) 123 45 67"), "385951234567");
  });

  it("keeps international numbers and cleans up their prefixes", () => {
    assert.equal(toWhatsappDigits("+385 91 123 4567"), "385911234567");
    assert.equal(toWhatsappDigits("00385 91 123 4567"), "385911234567");
    assert.equal(toWhatsappDigits("+385 (0)91 123 4567"), "385911234567");
    assert.equal(toWhatsappDigits("+49 151 2345 6789"), "4915123456789");
    assert.equal(toWhatsappDigits("385911234567"), "385911234567");
  });

  it("returns null for numbers that are too short or too long", () => {
    assert.equal(toWhatsappDigits(""), null);
    assert.equal(toWhatsappDigits(null), null);
    assert.equal(toWhatsappDigits(undefined), null);
    assert.equal(toWhatsappDigits("12345"), null);
    assert.equal(toWhatsappDigits("+1234567"), null);
    assert.equal(toWhatsappDigits("1".repeat(16)), null);
    assert.equal(toWhatsappDigits("nema broja"), null);
  });
});

describe("links", () => {
  it("wa.me carries the text encoded", () => {
    assert.equal(whatsappHref("385911234567", "Pozdrav Ivana, upit U-2026-0007?"), "https://wa.me/385911234567?text=Pozdrav%20Ivana%2C%20upit%20U-2026-0007%3F");
  });

  it("sms: uses the international number and ?&body= (iOS and Android)", () => {
    assert.equal(smsHref("091 123 4567", "Pozdrav & hvala"), "sms:+385911234567?&body=Pozdrav%20%26%20hvala");
    assert.equal(smsHref("123", "x"), null);
  });
});

describe("leadReplyText", () => {
  it("greets by first name, names the inquiry and asks about the measurement", () => {
    assert.equal(
      leadReplyText({ name: "Ivana Horvat", brand: "EMNA Interijeri", number: "U-2026-0007", source: "studio" }),
      "Pozdrav Ivana, ovdje EMNA Interijeri. Zaprimili smo vaš upit U-2026-0007 za kuhinju iz 3D studija. Kada vam odgovara da se čujemo oko izmjere?",
    );
  });

  it("mentions the 3D studio only for studio inquiries, and copes without a name", () => {
    assert.equal(
      leadReplyText({ name: "  ", brand: "EMNA Interijeri", number: "U-2026-0012", source: "kontakt" }),
      "Pozdrav, ovdje EMNA Interijeri. Zaprimili smo vaš upit U-2026-0012. Kada vam odgovara da se čujemo oko izmjere?",
    );
  });
});

describe("quoteText", () => {
  it("is formal, with the quote's number and link", () => {
    assert.equal(
      quoteText({ name: "Ana  Kovač", number: "P-2026-0003", url: "https://emna.hr/ponuda/abc" }),
      "Dobar dan, Ana Kovač, šaljemo vam ponudu P-2026-0003: https://emna.hr/ponuda/abc",
    );
    assert.equal(quoteText({ name: null, number: "P-2026-0003", url: "https://emna.hr/ponuda/abc" }), "Dobar dan, šaljemo vam ponudu P-2026-0003: https://emna.hr/ponuda/abc");
  });

  it("leaves the link out for the share sheet, which adds it", () => {
    assert.equal(quoteText({ name: "Ivan Horvat", number: "P-2026-0003" }), "Dobar dan, Ivan Horvat, šaljemo vam ponudu P-2026-0003.");
  });
});
