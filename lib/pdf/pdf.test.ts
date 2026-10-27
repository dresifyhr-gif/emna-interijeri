/**
 * Kitchen PDF (lib/pdf): the content model for every layout and many options (every element listed once, under the label
 * the drawings use; materials, price rule, nothing invented about the company), the SVG painter on toSVG's output, QR
 * codes, file names, whole documents rendered in Node (page count, fonts, pictures) and the lazy-loading contract (nothing
 * outside the export path imports the PDF code statically).
 *
 *   npx tsx --test lib/pdf/*.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { describe, it } from "node:test";
import { jsPDF } from "jspdf";
import { PRICES_CONFIRMED, catalog } from "../studio/catalog";
import { elementLabels, kitchenDrawings, toSVG } from "../studio/drawings";
import { isSpacer } from "../studio/drawings/common";
import { planKitchen, sanitizeConfig } from "../studio/plan";
import { estimate, formatPrice } from "../studio/price";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout } from "../studio/types";
import { site } from "../site";
import { companyFromSite, companyLegal, companyLines, normalizeCompany } from "./company";
import { bodySize, elementsWord, hasFronts, kitchenPdfContent, materialSwatch, pricePolicy } from "./content";
import { isoDay, longDate, renderKitchenPdf, type PdfImage } from "./document";
import { createKitchenPdf, kitchenPdfFileName } from "./index";
import { drawQr, qrMatrix } from "./qr";
import { paintSvg, parseSvg, svgSize } from "./svg-paint";
import { drawSwatch, type SwatchSpec } from "./swatch";
import { registerFonts } from "./theme";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];

/** a spread of kitchens: every layout, windows, heights, glass, hoods, two-tone, backsplashes, islands with bars */
const VARIANTS: [string, KitchenConfig][] = [
  ...LAYOUTS.map((l): [string, KitchenConfig] => [l, kitchen({ layout: l })]),
  ["U s prozorom, letvica", kitchen({ layout: "U", walls: { a: 360, b: 300, c: 280 }, window: { wall: "a", offset: 120, width: 100, sill: 100 }, handles: "letvica", front: "hrast" })],
  ["otok do stropa, šank", kitchen({ layout: "otok", walls: { a: 420, b: 300, c: 300 }, ceiling: 290, heights: { mode: "do-stropa" }, islandSpec: { functions: "hob", bar: { kind: "raised" } } })],
  ["poluotok stol, bez nape", kitchen({ layout: "poluotok", islandSpec: { side: "left", bar: { kind: "table" }, hood: false, functions: "both" } })],
  ["dvobojna, staklo, napa", kitchen({ layout: "L", zoneFronts: { upper: "bijela", tall: "hrast" }, glass: { type: "satinirano", frame: "alu-crni" }, hood: { kind: "dimnjak", finish: "crna" } })],
  ["obloga pločice, 2 cm ploča, reling", kitchen({ layout: "ravna", walls: { a: 420, b: 200, c: 200 }, backsplash: { kind: "plocice", finish: "hex-bijele" }, worktop: { thickness: 2 }, rails: ["a"] })],
  ["bez obloge, luft, LED off", kitchen({ layout: "G", backsplash: { kind: "bez" }, handles: "luft", led: false, room: { wall: "kadulja", floor: "parket" } })],
  ["prilagođene visine", kitchen({ layout: "L", ceiling: 300, heights: { mode: "custom", upper: 90, tallTop: 240, worktop: 95 } })],
];

const JPG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQACADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUG/8QAFhAAAwAAAAAAAAAAAAAAAAAAABRh/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAID/8QAFREBAQAAAAAAAAAAAAAAAAAAABL/2gAMAwEAAhEDEQA/AMipApC8pApDK1ygqQKQvKQKQWS//9k=";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGAQMAAADEy024AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURcm5mv///1wUuwQAAAABYktHRAH/Ai3eAAAAB3RJTUUH6goaEg0dxxVYlAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0xMC0yNlQxODoxMzoyOSswMDowMKav6mEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMTAtMjZUMTg6MTM6MjkrMDA6MDDX8lLdAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTEwLTI2VDE4OjEzOjI5KzAwOjAwgOdzAgAAAAtJREFUCNdjYEAAAAAMAAHkNOpmAAAAAElFTkSuQmCC";
const IMG: PdfImage = { dataUrl: JPG, width: 32, height: 16, label: "Perspektiva desno" };
const URL_ = "https://emna-interijeri.vercel.app/studio?k=2.L.380.220.220.260.antracit.mramor.bez.1.240.1.0";
const DATE = new Date("2026-10-26T10:00:00Z");

/* ------------------------------------------------------------------ content */

describe("content model", () => {
  for (const [name, cfg] of VARIANTS) {
    it(`${name}: every element listed once, with the drawings' label`, () => {
      const plan = planKitchen(cfg);
      const c = kitchenPdfContent(cfg, { showPrice: true }, plan);
      const labels = elementLabels(plan);
      const rows = c.groups.flatMap((g) => g.rows);
      const ids = rows.map((r) => r.slotId);
      assert.equal(new Set(ids).size, ids.length, "an element listed twice");
      const expected = plan.slots.filter((s) => !isSpacer(s)).map((s) => s.id);
      assert.deepEqual([...ids].sort(), [...expected].sort(), "the list is not the plan's elements");
      for (const r of rows) {
        assert.equal(r.label, labels.get(r.slotId), `${r.slotId}: label`);
        assert.ok(r.name.length > 0 && r.position.includes("–"), `${r.slotId}: name / position`);
        assert.match(r.size, /^\d+(,\d)?( × \d+(,\d)? × \d+(,\d)?)?$/, `${r.slotId}: size "${r.size}"`);
        assert.ok(!/NaN|undefined|Infinity/.test(JSON.stringify(r)), `${r.slotId}: junk in a row`);
      }
      assert.equal(c.elementCount, rows.length);
      assert.ok(c.facts.some((f) => f.label === "Elementi" && f.value === elementsWord(rows.length)));
      // groups: walls first, then tall columns, then the island
      const isl = c.groups.findIndex((g) => g.title === "Otok" || g.title === "Poluotok");
      if (plan.island) assert.equal(isl, c.groups.length - 1, "the island group comes last");
      assert.ok(c.dimensions.startsWith("Zid A "), c.dimensions);
      assert.ok(c.dimensions.endsWith(`strop ${plan.cfg.ceiling} cm`));
    });
  }

  it("element sizes follow the plan's heights", () => {
    const plan = planKitchen(kitchen({ layout: "ravna", walls: { a: 300, b: 200, c: 200 } }));
    const base = plan.slots.find((s) => s.zone === "base" && !isSpacer(s) && !s.corner);
    const upper = plan.slots.find((s) => s.zone === "upper" && !isSpacer(s) && s.type === "vrata");
    assert.ok(base && upper);
    const H = plan.heights;
    assert.equal(bodySize(plan, base), `${base.width} × ${H.worktop - H.worktopT - H.plinth} × 60`);
    assert.equal(bodySize(plan, upper), `${upper.width} × ${H.upperTop - H.upperBottom} × 35`);
  });

  it("open units have no opening style, doors and drawers do", () => {
    assert.equal(hasFronts({ zone: "base", type: "ladice" }), true);
    assert.equal(hasFronts({ zone: "upper", type: "vitrina" }), true);
    assert.equal(hasFronts({ zone: "base", type: "police" }), false);
    assert.equal(hasFronts({ zone: "base", type: "slobodno" }), false);
    assert.equal(hasFronts({ zone: "upper", type: "nisa" }), false);
  });

  it("the price: shown with the studio's range, or not at all", () => {
    const cfg = kitchen({ layout: "otok" });
    const shown = kitchenPdfContent(cfg, { showPrice: true });
    assert.ok(shown.price);
    assert.equal(shown.price.text, formatPrice(estimate(cfg)));
    assert.equal(shown.price.confirmed, PRICES_CONFIRMED);
    assert.ok(shown.price.included.includes("dostava i montaža"));
    assert.ok(shown.price.excluded[0].startsWith("kućanski aparati"));
    assert.ok(shown.facts.some((f) => f.label === "Okvirna cijena"));
    const hidden = kitchenPdfContent(cfg, { showPrice: false });
    assert.equal(hidden.price, null);
    assert.ok(!hidden.facts.some((f) => f.label === "Okvirna cijena"));
    // the studio shows its range (as the UI does); the admin only once the owner confirmed the rates
    assert.equal(pricePolicy("studio"), true);
    assert.equal(pricePolicy("admin"), PRICES_CONFIRMED);
  });

  it("materials: one card per front material, the worktop, the backsplash", () => {
    const one = kitchenPdfContent(kitchen({ layout: "L" }), { showPrice: false }).materials;
    assert.deepEqual(
      one.cards.map((c) => c.label),
      ["Fronte", "Radna ploča", "Zidna obloga"],
    );
    const two = kitchenPdfContent(kitchen({ layout: "L", zoneFronts: { upper: "bijela" } }), { showPrice: false }).materials;
    assert.equal(two.cards.filter((c) => c.label === "Fronte").length, 2);
    assert.ok(two.cards.every((c) => c.swatch || c.label !== "Fronte"));
    const bare = kitchenPdfContent(kitchen({ layout: "ravna", backsplash: { kind: "bez" } }), { showPrice: false }).materials;
    assert.ok(!bare.cards.some((c) => c.label === "Zidna obloga"));
    assert.ok(bare.lines.some((l) => l.label === "Zidna obloga"));
    const glass = kitchenPdfContent(kitchen({ layout: "L", glass: { type: "dimljeno" } }), { showPrice: false });
    const hasVitrine = planKitchen(kitchen({ layout: "L" })).slots.some((s) => s.type === "vitrina");
    if (hasVitrine) assert.ok(glass.materials.lines.some((l) => l.label === "Staklo vitrina"));
    const hood = kitchenPdfContent(kitchen({ layout: "ravna", hood: { kind: "dimnjak" } }), { showPrice: false });
    assert.ok(hood.materials.lines.some((l) => l.label === "Napa" && /dimnjak/i.test(l.value)));
  });

  it("a kitchen on part of a wall: the dimensions say how much of it", () => {
    const part = kitchenPdfContent(kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, extents: { b: { length: 300 } } }), { showPrice: false });
    assert.match(part.dimensions, /zid B 450 cm \(kuhinja 300 cm\)/);
    assert.doesNotMatch(part.dimensions, /Zid A 300 cm \(/);
    assert.doesNotMatch(kitchenPdfContent(kitchen({ layout: "L" }), { showPrice: false }).dimensions, /kuhinja/);
  });

  it("a side-by-side fridge: its niche in the list, and how far the appliance stands out", () => {
    const cfg = kitchen({ layout: "L", tallRun: [{ type: "pecnica", width: 60 }, { type: "hladnjak-sbs", width: 96 }] });
    const rows = kitchenPdfContent(cfg, { showPrice: false }).groups.flatMap((g) => g.rows);
    const sbs = rows.find((r) => /side-by-side/i.test(r.name));
    assert.ok(sbs, "the side-by-side niche is listed");
    assert.match(sbs.size, /^96 × /);
    assert.match(sbs.notes, /viri 7 cm ispred fronti/);
  });

  it("material and equipment lines read as sentences", () => {
    for (const [name, cfg] of VARIANTS) {
      for (const l of kitchenPdfContent(cfg, { showPrice: false }).materials.lines) {
        const c = l.value.charAt(0);
        assert.ok(c === c.toLocaleUpperCase("hr"), `${name}: ${l.label} "${l.value}"`);
      }
    }
  });

  it("Croatian words", () => {
    assert.equal(elementsWord(1), "1 element");
    assert.equal(elementsWord(3), "3 elementa");
    assert.equal(elementsWord(12), "12 elemenata");
    assert.equal(elementsWord(21), "21 element");
    assert.equal(elementsWord(24), "24 elementa");
    assert.equal(longDate(DATE), "26. listopada 2026.");
    assert.equal(isoDay(DATE), "2026-10-26");
  });
});

/* ------------------------------------------------------------------ company */

describe("company facts", () => {
  it("only what is known — nothing invented", () => {
    const c = companyFromSite();
    assert.equal(c.brand, site.name);
    assert.equal(c.phone, site.contact.phone);
    assert.equal(c.email, site.contact.email);
    assert.equal(c.oib, site.legal.oib);
    assert.equal(c.web, null);
    // every line comes from a known field
    for (const l of companyLines(c)) assert.ok(l.value.length > 0);
    if (!site.contact.phone && !site.contact.email && !site.contact.address) assert.equal(companyLines(c).length, 0);
  });

  it("normalizes server JSON and junk", () => {
    const n = normalizeCompany({ brand: "EMNA Interijeri", name: " EMNA d.o.o. ", phone: "", email: "info@emna.hr", web: "https://www.emna.hr/", oib: null, extra: "x" });
    assert.equal(n.name, "EMNA d.o.o.");
    assert.equal(n.phone, null);
    assert.equal(n.web, "www.emna.hr");
    assert.deepEqual(
      companyLines(n).map((l) => l.label),
      ["E-mail", "Web"],
    );
    assert.deepEqual(companyLegal(n), ["EMNA d.o.o."]);
    const junk = normalizeCompany("nonsense");
    assert.equal(junk.brand, site.name);
    assert.equal(junk.address, null);
  });
});

/* ------------------------------------------------------------------ SVG painter */

/** a jsPDF that records what is drawn */
function recorder() {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  registerFonts(pdf);
  const calls: Record<string, number> = {};
  for (const k of ["moveTo", "lineTo", "curveTo", "text", "fill", "stroke", "fillStroke", "clip"] as const) {
    const orig = (pdf[k] as (...a: unknown[]) => unknown).bind(pdf);
    (pdf as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => {
      calls[k] = (calls[k] ?? 0) + 1;
      for (const v of a) if (typeof v === "number") assert.ok(Number.isFinite(v), `${k}: ${String(v)}`);
      return orig(...a);
    };
  }
  return { pdf, calls };
}

describe("SVG painter", () => {
  it("reads toSVG's output at its paper size", () => {
    const d = kitchenDrawings(planKitchen(kitchen({ layout: "U" })));
    for (const dr of [d.plan, ...d.elevations]) {
      const r = toSVG(dr, { fit: { width: 269, height: 140 }, font: "Inter", idPrefix: `t-${dr.id}` });
      const size = svgSize(r.svg);
      assert.ok(size);
      assert.ok(Math.abs(size.width - r.width) < 0.02 && Math.abs(size.height - r.height) < 0.02);
      const { pdf, calls } = recorder();
      const res = paintSvg(pdf, r.svg, { x: 14, y: 40 });
      assert.ok(res.count > 20, `${dr.id}: painted ${res.count}`);
      assert.ok((calls.text ?? 0) > 5, `${dr.id}: texts`);
      assert.ok((calls.stroke ?? 0) + (calls.fillStroke ?? 0) > 10);
    }
  });

  it("paints the SVG subset: paths with arcs, tspans, rotation, patterns, halos, entities", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20">
      <defs><pattern id="p-tile" patternUnits="userSpaceOnUse" width="3" height="1.5"><rect width="3" height="1.5" fill="#f1eee8"/><path d="M0 0H3M0 0V1.5" stroke="#1d1c1a" stroke-opacity=".35" stroke-width="0.1" fill="none"/></pattern></defs>
      <title>t</title>
      <g data-layer="x" stroke="#8a7a5c" fill="#8a7a5c">
        <polygon points="1,1 10,1 10,8 1,8" fill="url(#p-tile)" stroke="#000" stroke-width="0.2"/>
        <path d="M12 5A3 3 0 0 0 18 5" fill="none" stroke-width="0.3"/>
        <circle cx="25" cy="5" r="2" fill="#e2e1df" stroke="#000" stroke-width="0.2" stroke-dasharray="0.5 0.3"/>
        <text x="20" y="15" font-size="2.2" text-anchor="middle" stroke="none" transform="rotate(-90 20 15)">63,5 &amp; č</text>
        <text x="2" y="18" font-size="3" font-weight="600" stroke="#fff" stroke-width="0.7" paint-order="stroke">A1 <tspan font-weight="400" fill="#6d675d">· M 1:20</tspan></text>
      </g>
    </svg>`;
    const root = parseSvg(svg);
    assert.ok(root);
    assert.equal(root.tag, "svg");
    const { pdf, calls } = recorder();
    const r = paintSvg(pdf, svg, { x: 10, y: 10, scale: 2 });
    assert.equal(r.width, 80);
    assert.equal(r.height, 40);
    assert.equal(r.count, 5);
    assert.ok((calls.curveTo ?? 0) >= 2 + 4, "the arc and the circle as béziers");
    assert.ok((calls.clip ?? 0) >= 1, "the pattern's grid is clipped to the shape");
    assert.ok((calls.text ?? 0) >= 4, "the rotated text, the halo, the label and its tspan");
    assert.equal(parseSvg("<g/>"), null);
  });
});

/* ------------------------------------------------------------------ QR, file names */

describe("QR and file names", () => {
  it("encodes the studio link", () => {
    const q = qrMatrix(URL_);
    assert.ok(q.size >= 21 && q.size <= 177);
    assert.equal(q.data.length, q.size);
    assert.ok(q.data.every((row) => row.length === q.size));
    // the finder pattern in the top-left corner
    assert.deepEqual(q.data[0].slice(0, 7), [true, true, true, true, true, true, true]);
    const long = qrMatrix(`${URL_}${"x".repeat(900)}`);
    assert.ok(long.size > q.size);
    const { pdf, calls } = recorder();
    const m = drawQr(pdf, q, 10, 10, 30, { light: "#ffffff" });
    assert.ok(m > 0.2 && m < 2);
    void calls;
  });

  it("file names", () => {
    assert.equal(kitchenPdfFileName(DATE), "EMNA-kuhinja-2026-10-26.pdf");
    assert.equal(kitchenPdfFileName(DATE, { reference: "U-2026-0012" }), "EMNA-kuhinja-U-2026-0012-2026-10-26.pdf");
    assert.equal(kitchenPdfFileName(DATE, { brand: "Đurđa Šarić", reference: "č/ć ž" }), "DURDA-kuhinja-c-c-z-2026-10-26.pdf");
  });
});

/* ------------------------------------------------------------------ whole documents */

describe("documents", () => {
  for (const [name, cfg] of VARIANTS) {
    it(`${name}: renders every page`, async () => {
      const plan = planKitchen(cfg);
      const drawings = kitchenDrawings(plan);
      let last = 0;
      const doc = await renderKitchenPdf({ cfg, configUrl: URL_, showPrice: true, date: DATE, onProgress: (p) => (last = p) });
      // cover, floor plan, one page per elevation, element list (1+), materials, closing page
      const min = 1 + 1 + drawings.elevations.length + 1 + 1 + 1;
      assert.ok(doc.pages >= min && doc.pages <= min + 3, `${doc.pages} pages, expected ~${min}`);
      assert.equal(last, 1);
      assert.equal(doc.drawings.length, 1 + drawings.elevations.length);
      for (const d of doc.drawings) assert.ok([5, 10, 20, 25, 30, 40, 50, 75, 100, 200].includes(d.scale), `${d.id} 1:${d.scale}`);
      const bytes = new Uint8Array(doc.pdf.output("arraybuffer"));
      assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
      const raw = new TextDecoder("latin1").decode(bytes);
      // the site's fonts as embedded Unicode (CID) fonts, no standard font (those have no č ć đ š ž)
      assert.ok(raw.includes("/BaseFont /Inter") && raw.includes("/BaseFont /InterTight"), "the site's fonts are embedded");
      assert.ok(raw.includes("/Subtype /CIDFontType2"), "Unicode fonts");
      assert.ok(!/\/BaseFont \/(Helvetica|Times|Courier)/.test(raw), "a standard font crept in");
      assert.ok(raw.includes(`/URI (${URL_})`), "the studio link is clickable");
    });
  }

  it("with pictures: the 3D page, the cover picture; JPEG and PNG", async () => {
    const cfg = kitchen({ layout: "L" });
    const without = await renderKitchenPdf({ cfg, configUrl: URL_, showPrice: false, date: DATE });
    const views = ["Perspektiva desno", "Perspektiva lijevo", "Frontalno"].map((label, i) => ({ ...IMG, label, dataUrl: i === 2 ? PNG : JPG, width: i === 2 ? 8 : 32, height: i === 2 ? 6 : 16 }));
    const withViews = await renderKitchenPdf({ cfg, configUrl: URL_, showPrice: false, date: DATE, hero: { ...IMG, zoom: 1.08 }, views });
    assert.equal(withViews.pages, without.pages + 1);
    const raw = new TextDecoder("latin1").decode(new Uint8Array(withViews.pdf.output("arraybuffer")));
    assert.ok((raw.match(/\/Subtype \/Image/g) ?? []).length >= 3, "the pictures are embedded");
    // a broken picture (not a data URL) is left out, not fatal
    const broken = await renderKitchenPdf({ cfg, configUrl: URL_, showPrice: false, date: DATE, views: [{ ...IMG, dataUrl: "https://example.com/x.jpg" }] });
    assert.equal(broken.pages, without.pages);
  });

  it("drawing pages: the legend goes beside an elevation when that gains a scale step", async () => {
    // a standard 380 × 260 wall: 1:25 with the legend beside it (1:30 under it)
    const l = await renderKitchenPdf({ cfg: kitchen({ layout: "L" }), configUrl: URL_, showPrice: false, date: DATE });
    assert.equal(l.drawings.find((d) => d.id === "zid-a")?.scale, 25);
    // with a window (two more chains): 1:30 (1:40 under it)
    const u = await renderKitchenPdf({ cfg: kitchen({ layout: "U", window: { wall: "a", offset: 140, width: 100, sill: 100 } }), configUrl: URL_, showPrice: false, date: DATE });
    assert.equal(u.drawings.find((d) => d.id === "zid-a")?.scale, 30);
    // its 20 elements stay on one page (a tighter rhythm keeps them there): cover, plan, 3 walls, list, materials, closing
    assert.equal(u.content.elementCount, 20);
    assert.equal(u.pages, 8);
  });

  it("every catalogue material paints a finite vector swatch", () => {
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: false });
    const specs = [...catalog.fronts, ...catalog.tops].map((m) => materialSwatch(m)).filter((x): x is SwatchSpec => Boolean(x));
    for (const b of catalog.backsplashes) {
      if (b.kind === "staklo") specs.push({ kind: "glass", color: b.render.color });
      else if (b.kind === "plocice") specs.push({ kind: "tiles", color: b.render.color, tones: b.render.tones, pattern: b.render.pattern, grout: b.render.grout });
    }
    assert.ok(specs.some((x) => x.kind === "marble") && specs.some((x) => x.kind === "wood") && specs.some((x) => x.kind === "tiles"));
    specs.forEach((sp, i) => drawSwatch(pdf, sp, 14 + (i % 5) * 55, 20 + (Math.floor(i / 5) % 4) * 45, 50, 30, 1.8));
    const raw = pdf.output();
    assert.ok(!/NaN|Infinity/.test(raw), "a NaN in a swatch");
    // deterministic: the same material looks the same in every PDF
    const one = (sp: SwatchSpec) => {
      const p = new jsPDF({ unit: "mm", format: "a4", compress: false });
      drawSwatch(p, sp, 10, 10, 60, 30);
      return p.output().replace(/\/CreationDate \([^)]*\)/, "").replace(/\/ID \[[^\]]*\]/, "");
    };
    const marble = specs.find((x) => x.kind === "marble")!;
    assert.equal(one(marble), one(marble));
  });

  it("a stored config is sanitized; the file has its name and type", async () => {
    const stored = JSON.parse(JSON.stringify(kitchen({ layout: "U" }))) as Record<string, unknown>;
    stored.walls = { a: 99999, b: "x", c: 200 };
    const f = await createKitchenPdf({ cfg: stored as unknown as KitchenConfig, configUrl: URL_, showPrice: false, date: DATE, fileTag: "U-2026-0001" });
    assert.equal(f.fileName, "EMNA-kuhinja-U-2026-0001-2026-10-26.pdf");
    assert.equal(f.blob.type, "application/pdf");
    assert.ok(f.size > 20_000 && f.size < 600_000, `${f.size} B`);
    assert.ok(f.pages >= 6);
  });
});

/* ------------------------------------------------------------------ lazy loading */

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe("lazy loading", () => {
  const root = join(__dirname, "..", "..");
  it("nothing in the site, the studio or the admin imports the PDF code statically (types and lib/pdf/company aside)", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const f of files(join(root, dir))) {
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["'](@\/lib\/pdf[^"']*)["']/gm)) {
          if (m[1]) continue;
          // the company facts are a few lines of plain data, read by server pages
          if (m[2] === "@/lib/pdf/company") continue;
          offenders.push(`${f.slice(root.length + 1)}: ${m[2]}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the drawings reach only lib/pdf, the camera presets only the (lazy) engine: nothing of either in a first-load bundle", () => {
    // lib/studio/types.ts is in the homepage's and the studio's first-load JS: it carries types only for the export
    const types = readFileSync(join(root, "lib", "studio", "types.ts"), "utf8");
    assert.ok(!/export\s+const\s+SNAPSHOT_VIEWS\b/.test(types), "SNAPSHOT_VIEWS belongs in lib/studio/snapshot-views.ts");
    const offenders: string[] = [];
    const scan = [...files(join(root, "app")), ...files(join(root, "components")), ...files(join(root, "lib", "studio")), ...files(join(root, "lib", "pdf"))].filter(
      (f) => !f.endsWith(".test.ts") && !/[/\\]lib[/\\]studio[/\\](drawings|engine)[/\\]/.test(f),
    );
    const drawings = join(root, "lib", "studio", "drawings");
    const presets = join(root, "lib", "studio", "snapshot-views");
    const inPdf = (f: string) => f.startsWith(join(root, "lib", "pdf") + sep);
    for (const f of scan) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
        if (m[1]) continue;
        const spec = m[2];
        const target = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? join(dirname(f), spec) : null;
        if (!target) continue;
        // lib/pdf draws the drawings; the presets stay inside the engine's chunk (a second importer would split them
        // into a chunk of their own, one more request on the homepage's lazy engine load)
        const isDrawings = target === drawings || target.startsWith(drawings + sep);
        if ((isDrawings && !inPdf(f)) || target === presets) offenders.push(`${f.slice(root.length + 1)}: ${spec}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the PDF code is pure apart from browser.ts; three.js only through a dynamic import", () => {
    for (const f of files(join(root, "lib", "pdf"))) {
      if (f.endsWith(".test.ts")) continue;
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      assert.ok(!/from\s+["'](three|react)["']/.test(src), `${f}: three / react`);
      assert.ok(!/from\s+["'][^"']*studio\/engine[^"']*["']/.test(src), `${f}: the engine statically`);
      if (!f.endsWith("browser.ts")) assert.ok(!/\b(document|window)\.[a-zA-Z]/.test(src), `${f}: DOM`);
    }
  });
});
