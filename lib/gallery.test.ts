/**
 * Gallery (lib/gallery.ts): photos grouped by kitchen. Every photo belongs to exactly one kitchen, the five lead kitchens
 * are five different ones with full-size covers, the files exist, and every "Složite sličnu u 3D-u" look is made of
 * catalogue ids the studio really opens.
 *
 *   npx tsx --test lib/gallery.test.ts
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gallery, inquiryHref, kitchenCount, photoCount, photoSlug, projects, studioHref } from "./gallery";
import { catalog } from "./studio/catalog";
import { configFromQuery } from "./studio/share";

const ids = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id));

describe("gallery — kitchens", () => {
  it("project slugs are unique and url-safe", () => {
    assert.equal(new Set(projects.map((p) => p.id)).size, projects.length);
    for (const p of projects) assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
  });

  it("every photo belongs to exactly one existing kitchen and carries its title, style and shape", () => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    for (const photo of gallery) {
      const p = byId.get(photo.project);
      assert.ok(p, `${photo.src}: unknown project ${photo.project}`);
      assert.ok(p.photos.includes(photo), photo.src);
      assert.equal(photo.title, p.title);
      assert.equal(photo.style, p.style);
      assert.equal(photo.shape, p.shape);
    }
    assert.equal(projects.reduce((n, p) => n + p.photos.length, 0), gallery.length);
  });

  it("every kitchen has photos, its cover is its first photo, and titles are unique", () => {
    for (const p of projects) {
      assert.ok(p.photos.length > 0, p.id);
      assert.equal(p.cover, p.photos[0], p.id);
      assert.ok(p.title.trim().length > 10, p.id);
    }
    assert.equal(new Set(projects.map((p) => p.title)).size, projects.length);
  });

  it("all srcs are unique, 4:3 and exist in /public", () => {
    assert.equal(new Set(gallery.map((p) => p.src)).size, gallery.length);
    for (const p of gallery) {
      assert.match(p.src, /^\/galerija\/[a-z0-9-]+\.jpg$/);
      assert.equal(p.w * 3, p.h * 4, p.src);
      assert.ok(existsSync(join(process.cwd(), "public", p.src)), `${p.src} is missing`);
    }
  });

  it("keeps the 30 photos and the first photo other pages rely on", () => {
    assert.equal(gallery.length, 30);
    assert.equal(gallery[0].src, "/galerija/kuhinja-siva-mramor.jpg");
  });

  it("the first five kitchens are five different ones with full-size covers", () => {
    const lead = projects.slice(0, 5);
    assert.equal(new Set(lead.map((p) => p.id)).size, 5);
    assert.equal(new Set(lead.map((p) => p.cover.src)).size, 5);
    for (const p of lead) assert.ok(p.cover.w >= 1400, `${p.id}: cover ${p.cover.src} is ${p.cover.w} px`);
  });

  it("the small sources are never a lead cover", () => {
    const small = ["kuhinja-bijela-otok", "kuhinja-bijela-granit", "kuhinja-zelena-drvo"];
    for (const p of projects.slice(0, 5)) assert.ok(!small.includes(photoSlug(p.cover)), p.id);
  });
});

describe("gallery — 3D studio looks", () => {
  const fronts = ids(catalog.fronts);
  const tops = ids(catalog.tops);
  const looks = projects.filter((p) => p.studio);

  it("several kitchens lead into the studio", () => {
    assert.ok(looks.length >= 5, `${looks.length} looks`);
  });

  it("every front and top is a catalogue id", () => {
    for (const p of looks) {
      assert.ok(fronts.has(p.studio!.front), `${p.id}: front ${p.studio!.front}`);
      assert.ok(tops.has(p.studio!.top), `${p.id}: top ${p.studio!.top}`);
    }
  });

  it("every look round-trips through configFromQuery (the studio opens exactly that)", () => {
    for (const p of looks) {
      const look = p.studio!;
      const q = new URLSearchParams(studioHref(look).split("?")[1]);
      assert.equal(new URL(studioHref(look), "https://x.hr").pathname, "/studio");
      const cfg = configFromQuery({ oblik: q.get("oblik"), front: q.get("front"), top: q.get("top") });
      assert.equal(cfg.layout, look.oblik, p.id);
      assert.equal(cfg.front, look.front, p.id);
      assert.equal(cfg.top, look.top, p.id);
    }
  });
});

describe("gallery — links and labels", () => {
  it("the inquiry link names the photo by its file name", () => {
    assert.equal(photoSlug(gallery[0]), "kuhinja-siva-mramor");
    for (const p of gallery) {
      assert.match(inquiryHref(p), /^\/kontakt\?interes=kuhinja&slika=[a-z0-9-]+#upit$/);
      assert.equal(`/galerija/${photoSlug(p)}.jpg`, p.src);
    }
  });

  it("Croatian plurals", () => {
    assert.equal(kitchenCount(1), "1 kuhinja");
    assert.equal(kitchenCount(3), "3 kuhinje");
    assert.equal(kitchenCount(12), "12 kuhinja");
    assert.equal(kitchenCount(19), "19 kuhinja");
    assert.equal(kitchenCount(22), "22 kuhinje");
    assert.equal(photoCount(1), "1 fotografija");
    assert.equal(photoCount(2), "2 fotografije");
    assert.equal(photoCount(4), "4 fotografije");
    assert.equal(photoCount(5), "5 fotografija");
    assert.equal(photoCount(21), "21 fotografija");
  });
});
