/**
 * The inquiry forms' pure helpers (lib/lead-extras.ts): the message with the measurement wish and the liked photo,
 * the `?slika=` lookup, and how an ok reply of /api/upit is read (old and new shapes).
 *
 *   npx tsx --test lib/lead-extras.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gallery } from "./gallery";
import { MEASUREMENT_SLOTS, MESSAGE_MAX, TIMELINES, composeMessage, confirmationOf, findGalleryPhoto, leadNumberOf } from "./lead-extras";

const photo = { title: "Antracit kuhinja s mramornom pločom", src: "/galerija/kuhinja-siva-mramor.jpg" };

describe("composeMessage", () => {
  it("returns the visitor's text alone when there are no extras", () => {
    assert.equal(composeMessage({ message: "  Kuhinja 3 m, rok proljeće. " }), "Kuhinja 3 m, rok proljeće.");
    assert.equal(composeMessage({ message: "Tekst", measurement: { wanted: false, slots: ["subotom"] }, photo: null }), "Tekst");
    assert.equal(composeMessage({ message: "" }), "");
  });

  it("adds a labelled line for the measurement, with the chosen slots in order", () => {
    assert.equal(
      composeMessage({ message: "Zdravo", measurement: { wanted: true, slots: ["subotom", "radnim danom poslije podne"] } }),
      "Zdravo\n\n— Želim izmjeru: subotom, radnim danom poslije podne",
    );
    assert.equal(composeMessage({ message: "", measurement: { wanted: true, slots: [] } }), "— Želim izmjeru");
    // duplicates and blanks are dropped
    assert.equal(composeMessage({ message: "", measurement: { wanted: true, slots: ["subotom", " subotom ", ""] } }), "— Želim izmjeru: subotom");
  });

  it("adds the liked photo with its title and path, after the measurement", () => {
    assert.equal(
      composeMessage({ message: "", measurement: { wanted: true, slots: ["subotom"] }, photo }),
      "— Želim izmjeru: subotom\n— Sviđa mi se fotografija: Antracit kuhinja s mramornom pločom (/galerija/kuhinja-siva-mramor.jpg)",
    );
  });

  it("stays within the schema's limit, shortening the visitor's text and keeping the labelled lines whole", () => {
    const long = "riječ ".repeat(800).trim();
    assert.ok(long.length > MESSAGE_MAX);
    const out = composeMessage({ message: long, measurement: { wanted: true, slots: [...MEASUREMENT_SLOTS] }, photo });
    assert.ok(out.length <= MESSAGE_MAX, `length ${out.length}`);
    assert.ok(out.endsWith(`— Sviđa mi se fotografija: ${photo.title} (${photo.src})`));
    assert.ok(out.includes("— Želim izmjeru: radnim danom prije podne, radnim danom poslije podne, subotom"));
    // cut between words, marked with "…"
    assert.match(out, /^riječ( riječ)*…\n\n— Želim izmjeru/);

    const plain = composeMessage({ message: long });
    assert.ok(plain.length <= MESSAGE_MAX);
    assert.ok(plain.endsWith("…"));
  });

  it("a text exactly at the limit with no extras is left alone", () => {
    const exact = "a".repeat(MESSAGE_MAX);
    assert.equal(composeMessage({ message: exact }), exact);
  });
});

describe("findGalleryPhoto", () => {
  it("finds a gallery photo by its file name", () => {
    const p = findGalleryPhoto("kuhinja-siva-mramor");
    assert.equal(p?.src, "/galerija/kuhinja-siva-mramor.jpg");
    assert.equal(p?.title, "Antracit L-kuhinja s mramornom pločom");
    assert.equal(findGalleryPhoto(" Kuhinja-Siva-Mramor ")?.src, "/galerija/kuhinja-siva-mramor.jpg");
  });

  it("every gallery photo can be found by its own name", () => {
    for (const g of gallery) {
      const name = g.src.replace(/^\/galerija\//, "").replace(/\.jpg$/, "");
      assert.equal(findGalleryPhoto(name), g, name);
    }
  });

  it("returns null for unknown, empty or malicious input", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "nepostojeca-kuhinja",
      "kuhinja-siva-mramor.jpg",
      "../galerija/kuhinja-siva-mramor",
      "/galerija/kuhinja-siva-mramor",
      "kuhinja siva mramor",
      "kuhinja-siva-mramor%00",
      "<script>alert(1)</script>",
      "javascript:alert(1)",
      "a".repeat(200),
    ]) {
      assert.equal(findGalleryPhoto(bad), null, String(bad));
    }
  });
});

describe("reading the reply of /api/upit", () => {
  it("tells sent, failed and nothing-to-say apart", () => {
    assert.equal(confirmationOf({ ok: true, email: "sent" }), "sent");
    assert.equal(confirmationOf({ ok: true, confirmation: true }), "sent");
    assert.equal(confirmationOf({ ok: true, email: "failed", confirmation: false }), "failed");
    // e-mail is off: no sentence about a confirmation at all
    assert.equal(confirmationOf({ ok: true, confirmation: false, email: "off" }), "none");
    // the old shape's false could mean "off" — never read as a failure
    assert.equal(confirmationOf({ ok: true, confirmation: false }), "none");
    assert.equal(confirmationOf({ ok: true }), "none");
  });

  it("reads the inquiry number only in its own form", () => {
    assert.equal(leadNumberOf({ ok: true, number: "U-2026-0099" }), "U-2026-0099");
    assert.equal(leadNumberOf({ ok: true }), null);
    assert.equal(leadNumberOf({ ok: true, number: 7 }), null);
    assert.equal(leadNumberOf({ ok: true, number: "<b>U-2026-0099</b>" }), null);
  });
});

describe("TIMELINES", () => {
  it("are the four answers to 'Kada planirate?' the studio has always sent", () => {
    assert.deepEqual([...TIMELINES], ["Što prije", "1–3 mjeseca", "3–6 mjeseci", "Samo istražujem"]);
  });
});
