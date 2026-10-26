/**
 * What the kitchen PDF says — built from the same plan as the 3D view, the drawings, the price and the summary
 * (lib/studio/plan.ts planKitchen), as plain data: the cover facts, the element list per wall, the materials, the rough
 * price and the next steps. No jsPDF, no DOM: the page layout (document.ts) only places it, and a future CAD / CNC
 * export or an HTML print view can read the same model.
 */

import {
  FINISH_DEFAULTS,
  PRICES_CONFIRMED,
  SBS,
  backsplashDef,
  catalog,
  cornerFoot,
  defaultHandleColor,
  finishDef,
  frontDef,
  handleColorDef,
  handleDef,
  hoodFinishDef,
  hoodKindDef,
  roomFloorDef,
  roomWallDef,
  topDef,
  worktopThicknessDef,
  type MaterialDef,
} from "../studio/catalog";
import { elementLabels } from "../studio/drawings/common";
import { carcassTop, tallUnitTop } from "../studio/drawings/face";
import { fmtCm } from "../studio/drawings/model";
import {
  DIM,
  backsplashOfCfg,
  frontFor,
  glassOf,
  hasTopBox,
  hoodKindOf,
  isPeninsula,
  isTallList,
  openingOf,
  planKitchen,
  shelvesOf,
  topDepthOf,
  worktopThickness,
  type KitchenPlan,
  type ListId,
  type PlanSlot,
} from "../studio/plan";
import { breakdown, estimate, formatPrice } from "../studio/price";
import { composition, glassText, islandName, islandSummary } from "../studio/summary";
import type { FrontZone, HandleStyle, KitchenConfig, Layout, WallId } from "../studio/types";
import type { SwatchSpec } from "./swatch";

/* ------------------------------------------------------------------ types */

export interface PdfFact {
  label: string;
  value: string;
}

export interface ElementRow {
  slotId: string;
  /** "A3" — the same label as on the drawings */
  label: string;
  /** "Tri ladice" */
  name: string;
  /** "60–120" (cm from the left end of the wall, standing in the room facing it) */
  position: string;
  /** "60 × 76 × 60" (width × height × depth of the body, cm) */
  size: string;
  /** what the element is / does (the catalogue description: mechanism, what is not included) */
  description: string;
  /** opening style ("Gola profil", "Na dodir"); "—" for open units */
  opening: string;
  /** the element's own options: glass, top box, shelves, end unit, hood … ("" = none) */
  notes: string;
}

export interface ElementGroup {
  /** "Zid A · donji elementi", "Visoki stup", "Otok" */
  title: string;
  /** "Antracit mat" — the front material of the group */
  front: string;
  rows: ElementRow[];
  /** lines under the group (the island: seating, bar, hood) */
  notes: string[];
}

export interface MaterialCard {
  /** "Fronte", "Fronte · gornji elementi", "Radna ploča" */
  label: string;
  name: string;
  /** "debljina 4 cm", "kamen, poliran" … */
  note?: string;
  swatch: SwatchSpec | null;
}

export interface SpecLine {
  label: string;
  value: string;
  swatch?: SwatchSpec;
}

export interface PriceInfo {
  low: number;
  high: number;
  /** "11.200 – 13.200 €" */
  text: string;
  /** the owner has confirmed the catalogue's rates (lib/studio/catalog.ts PRICES_CONFIRMED) */
  confirmed: boolean;
  /** what the estimate counts, in words */
  included: string[];
  /** what it does not count */
  excluded: string[];
}

export interface KitchenPdfContent {
  layout: Layout;
  /** "Kuhinja u obliku slova L" */
  layoutName: string;
  /** "Zid A 380 cm · zid B 220 cm · strop 260 cm" */
  dimensions: string;
  /** the cover's key facts (fronts, worktop, elements) */
  facts: PdfFact[];
  /** labelled elements (empty space not counted) */
  elementCount: number;
  groups: ElementGroup[];
  materials: { cards: MaterialCard[]; lines: SpecLine[] };
  /** null = the price is not shown */
  price: PriceInfo | null;
  /** the planner's notes (something did not fit) */
  warnings: string[];
  steps: { title: string; text: string }[];
}

export interface ContentOptions {
  /** show the rough price (see pricePolicy) */
  showPrice: boolean;
}

/* ------------------------------------------------------------------ words */

export const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "Ravna kuhinja",
  L: "Kuhinja u obliku slova L",
  U: "Kuhinja u obliku slova U",
  otok: "Ravna kuhinja s otokom",
  poluotok: "Kuhinja s poluotokom",
  G: "Kuhinja u obliku slova G",
};

/** short opening-style names for the element table (full names: catalog.handles) */
export const OPENING_SHORT: Record<HandleStyle, string> = {
  bez: "Gola profil",
  letvica: "Letvica",
  gumb: "Gumb",
  utor: "Utorna ručka",
  push: "Na dodir",
  luft: "Luft za prste",
};

const HOOD_WORDS = {
  ugradbena: "napa ugrađena u zidni element",
  dimnjak: "zidna napa s dimnjakom",
  kosa: "kosa staklena napa",
  ploca: "ploča s ugrađenim odsisom (napa u ploči)",
} as const;

const ZONE_WORD: Record<FrontZone, string> = { base: "donji elementi", upper: "gornji elementi", tall: "visoki elementi", island: "otok" };

/** "1 element", "3 elementa", "7 elemenata" */
export function elementsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} element`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} elementa`;
  return `${n} elemenata`;
}

/**
 * Whether the PDF shows the rough price — the studio's rule (components/studio/Price.tsx): the customer sees the range in
 * the studio, labelled "okvirno", whatever PRICES_CONFIRMED says, so their PDF shows it too. The admin's PDF goes out on
 * the company's behalf: it shows the catalogue estimate only once the owner has confirmed the rates (it can still be
 * switched on by hand).
 */
export function pricePolicy(source: "studio" | "admin"): boolean {
  return source === "studio" ? true : PRICES_CONFIRMED;
}

/* ------------------------------------------------------------------ swatches */

export function materialSwatch(m: MaterialDef | undefined): SwatchSpec | null {
  if (!m) return null;
  const r = m.render;
  return { kind: r.kind, color: r.color, tones: r.tones, gloss: (r.clearcoat ?? 0) > 0.3, bold: r.veins === "bold" };
}

const chip = (color: string, metal = false): SwatchSpec => ({ kind: metal ? "brushed" : "solid", color, gloss: metal });

/* ------------------------------------------------------------------ elements */

const slotDefOf = (s: Pick<PlanSlot, "zone" | "type">) => catalog.modules.find((m) => m.zone === (s.zone === "island" ? "base" : s.zone) && m.id === s.type);

/** the element has fronts that open (doors, drawers, flaps, appliance fronts) — open units and panels do not */
export function hasFronts(s: Pick<PlanSlot, "zone" | "type">): boolean {
  const d = slotDefOf(s);
  return Boolean(d && !d.spacer && !d.filler && d.demo !== false);
}

/** "60 × 76 × 60": width × body height × depth (cm); boards and shelves: their width only */
export function bodySize(plan: KitchenPlan, s: PlanSlot): string {
  const d = slotDefOf(s);
  const w = fmtCm(s.width);
  if (!d || d.spacer) return w;
  if (d.rows || s.type === "polica") return w;
  const H = plan.heights;
  let h: number;
  let depth: number;
  if (s.zone === "upper") {
    h = H.upperTop - H.upperBottom;
    depth = DIM.upperDepth;
  } else if (s.zone === "tall") {
    h = tallUnitTop(H) - H.plinth;
    depth = DIM.baseDepth;
  } else {
    h = carcassTop(H) - H.plinth;
    depth = DIM.baseDepth;
  }
  if (s.corner || d.corner) {
    const f = cornerFoot(s.zone === "upper" ? "upper" : "base", s.type);
    if (f.shape !== "blind") depth = f.across;
  }
  return `${w} × ${fmtCm(h)} × ${fmtCm(depth)}`;
}

/** the element's own options beyond its type, for the table's "Napomena" column */
export function elementNotes(plan: KitchenPlan, s: PlanSlot): string {
  const c = plan.cfg;
  const d = slotDefOf(s);
  if (!d || d.spacer) return "";
  const o = s.opt;
  const H = plan.heights;
  const parts: string[] = [];
  if (d.glass) parts.push(`staklo: ${glassText(glassOf(c, o))}`);
  if (o?.open && o.open !== c.handles) parts.push("otvaranje drugačije od ostatka kuhinje");
  if (s.zone === "upper" && H.topRow && hasTopBox(s.type)) {
    const depth = s.corner ? null : topDepthOf(c, o);
    parts.push(`nadgradni ormarić ${fmtCm(H.topRow.to - H.topRow.from)} cm${depth ? `, dubina ${depth} cm` : ""}`);
  }
  if (s.zone === "tall" && H.tallSplit !== null) parts.push(`nadgradni ormarić ${fmtCm(H.tallTop - H.tallSplit)} cm`);
  if (d.feature === "hob" && s.zone !== "island") {
    const k = hoodKindOf(c, o);
    if (k !== "ugradbena") parts.push(HOOD_WORDS[k]);
  }
  if (d.rows) {
    const sh = shelvesOf(o);
    parts.push(`${sh.rows} ${sh.rows === 1 ? "polica" : "police"}${sh.led ? " s LED-om" : ""}`);
  } else if (d.lit && o?.led === false) parts.push("bez LED-a");
  if (s.end) parts.push(`završetak ${s.end.side === "left" ? "lijevog" : "desnog"} kraja`);
  // the side-by-side fridge stands in its niche deeper than the 60 cm panels (catalog SBS)
  if (s.type === "hladnjak-sbs" || s.type === "hladnjak-sbs-vrata") {
    parts.push(`hladnjak ${fmtCm(SBS.applianceDepth)} cm dubok (s vratima): viri ${fmtCm(SBS.applianceDepth - SBS.panelDepth)} cm ispred fronti`);
  }
  if (s.corner && !d.corner) parts.push("u slijepom kutu");
  return parts.join("; ");
}

/** wall rows first (A, B, C; base before wall units), then the tall columns, then the island */
function groupOrder(list: ListId): number {
  if (isTallList(list)) return 10;
  if (list === "isl") return 20;
  const w = "abc".indexOf(list[0]);
  return w * 2 + (list.endsWith(":u") ? 1 : 0);
}

export function elementGroups(plan: KitchenPlan): ElementGroup[] {
  const c = plan.cfg;
  const labels = elementLabels(plan);
  const bySlot = new Map(plan.slots.map((s) => [s.id, s]));
  const rows = [...composition(c, plan)].sort((p, q) => groupOrder(p.list) - groupOrder(q.list));
  const out: ElementGroup[] = [];
  for (const r of rows) {
    const items: ElementRow[] = [];
    for (const it of r.items) {
      if (it.spacer) continue;
      const s = bySlot.get(it.slotId);
      if (!s) continue;
      const d = slotDefOf(s);
      items.push({
        slotId: s.id,
        label: labels.get(s.id) ?? "—",
        name: it.name,
        position: `${fmtCm(s.x)}–${fmtCm(s.x + s.width)}`,
        size: bodySize(plan, s),
        description: d?.description ?? "",
        opening: hasFronts(s) ? OPENING_SHORT[openingOf(c, s.opt)] : "—",
        notes: elementNotes(plan, s),
      });
    }
    if (!items.length) continue;
    // a wall's tall units stand in its base row; the label says so when there are any
    const title = r.list === "isl" ? islandName(c.layout) : r.label;
    out.push({
      title,
      front: frontDef(r.front)?.name ?? r.front,
      rows: items,
      notes: r.list === "isl" ? islandSummary(plan) : [],
    });
  }
  return out;
}

/* ------------------------------------------------------------------ materials */

export function materials(plan: KitchenPlan): { cards: MaterialCard[]; lines: SpecLine[] } {
  const c = plan.cfg;
  const cards: MaterialCard[] = [];
  const lines: SpecLine[] = [];
  const zones = (["base", "upper", "tall", "island"] as FrontZone[]).filter((z) => plan.slots.some((s) => s.zone === z));

  // fronts: one card per front material, naming the zones that wear it when the kitchen is two-tone
  const byFront = new Map<string, FrontZone[]>();
  for (const z of zones) {
    const f = frontFor(c, z);
    byFront.set(f, [...(byFront.get(f) ?? []), z]);
  }
  const twoTone = byFront.size > 1;
  for (const [id, zs] of byFront) {
    const m = frontDef(id);
    const words = zs.map((z) => (z === "island" ? (isPeninsula(c.layout) ? "poluotok" : "otok") : ZONE_WORD[z]));
    const family = m ? catalog.frontFamilies.find((f) => f.id === m.family)?.name : undefined;
    cards.push({
      label: "Fronte",
      name: m?.name ?? id,
      note: [twoTone ? words.join(", ") : null, family].filter(Boolean).join(" · ") || undefined,
      swatch: materialSwatch(m),
    });
  }
  if (!byFront.size) {
    const m = frontDef(c.front);
    cards.push({ label: "Fronte", name: m?.name ?? c.front, swatch: materialSwatch(m) });
  }

  // the worktop and its thickness
  const top = topDef(c.top);
  const thick = worktopThickness(c);
  cards.push({
    label: "Radna ploča",
    name: top?.name ?? c.top,
    note: `debljina ${worktopThicknessDef(thick)?.name ?? `${fmtCm(thick)} cm`}`,
    swatch: materialSwatch(top),
  });

  // the wall between the worktop and the wall units
  const bs = backsplashOfCfg(c);
  if (bs.kind === "ploca" || bs.kind === "pola") {
    cards.push({
      label: "Zidna obloga",
      name: top?.name ?? c.top,
      note: bs.kind === "pola" ? "materijal radne ploče, do pola visine" : "materijal radne ploče, do gornjih elemenata",
      swatch: materialSwatch(top),
    });
  } else if (bs.kind === "staklo" || bs.kind === "plocice") {
    const b = backsplashDef(bs.finish ?? undefined);
    cards.push({
      label: "Zidna obloga",
      name: b?.name ?? bs.finish ?? bs.kind,
      note: bs.kind === "staklo" ? "lakirano staklo" : "pločice",
      swatch: b
        ? bs.kind === "staklo"
          ? { kind: "glass", color: b.render.color }
          : { kind: "tiles", color: b.render.color, tones: b.render.tones, pattern: b.render.pattern, grout: b.render.grout }
        : null,
    });
  } else {
    lines.push({ label: "Zidna obloga", value: "Bez obloge — između radne ploče i gornjih elemenata vidi se zid" });
  }

  // a bar / table top in its own material
  const bar = plan.island?.bar;
  if (bar && bar.top !== c.top) {
    const t = topDef(bar.top);
    cards.push({ label: bar.kind === "raised" ? "Ploča šanka" : "Ploča stola", name: t?.name ?? bar.top, swatch: materialSwatch(t) });
  }

  // opening and hardware
  const handle = handleDef(c.handles);
  const hc = handleColorDef(c.finish?.handleColor ?? defaultHandleColor(c.handles));
  lines.push({ label: "Otvaranje fronti", value: `${handle?.name ?? c.handles}${handle?.note ? ` — ${handle.note}` : ""}` });
  if (handle?.coloured && hc) {
    lines.push({ label: c.handles === "bez" ? "Boja profila" : "Boja ručki", value: c.handles === "bez" ? hc.golaName : hc.name, swatch: chip(hc.render.color, hc.render.metalness > 0.5) });
  }
  const own = new Map<HandleStyle, number>();
  for (const s of plan.slots) {
    const o = s.opt?.open;
    if (o && o !== c.handles && hasFronts(s)) own.set(o, (own.get(o) ?? 0) + 1);
  }
  if (own.size) {
    lines.push({
      label: "Drugačije otvaranje",
      value: [...own].map(([id, n]) => `${handleDef(id)?.name ?? id}: ${elementsWord(n)}`).join("; "),
    });
  }

  // hoods
  const hoods: string[] = [];
  for (const r of plan.runs) {
    for (const h of r.hoods ?? []) {
      hoods.push(`${hoodKindDef(h.kind)?.name ?? h.kind}, ${fmtCm(h.width)} cm, ${(hoodFinishDef(h.finish)?.name ?? h.finish).toLowerCase()} — zid ${r.wall.toUpperCase()}`);
    }
  }
  if (plan.slots.some((s) => s.zone === "upper" && catalog.modules.find((m) => m.zone === "upper" && m.id === s.type)?.hood)) {
    hoods.push("ugradbena napa u zidnom elementu iznad ploče");
  }
  if (plan.slots.some((s) => (s.zone === "base" || s.zone === "island") && slotDefOf(s)?.feature === "hob" && hoodKindOf(c, s.opt) === "ploca")) {
    hoods.push("ploča za kuhanje s ugrađenim odsisom (napa u ploči)");
  }
  const ih = plan.island?.hood;
  if (ih) {
    const fin = ih.finish ? `, ${(hoodFinishDef(ih.finish)?.name ?? ih.finish).toLowerCase()}` : "";
    hoods.push(`${ih.style === "kaseta" ? "stropna kaseta" : "otočna napa s dimnjakom"} ${fmtCm(ih.width)} × ${fmtCm(ih.depth)} cm${fin} — iznad ${isPeninsula(c.layout) ? "poluotoka" : "otoka"}`);
  }
  if (hoods.length) lines.push({ label: "Napa", value: `${hoods.join("; ")} (sam uređaj nije uračunat)` });

  // glass of the vitrines
  if (plan.slots.some((s) => slotDefOf(s)?.glass)) lines.push({ label: "Staklo vitrina", value: glassText(glassOf(c)) });

  // sink, tap, appliances, plinth, LED
  if (plan.slots.some((s) => slotDefOf(s)?.feature === "sink")) {
    const sink = finishDef("sinks", c.finish?.sink ?? FINISH_DEFAULTS.sink);
    const tap = finishDef("taps", c.finish?.tap ?? FINISH_DEFAULTS.tap);
    if (sink) lines.push({ label: "Sudoper", value: sink.name, swatch: chip(sink.render.color, sink.render.metalness > 0.5) });
    if (tap) lines.push({ label: "Slavina", value: tap.name, swatch: chip(tap.render.color, tap.render.metalness > 0.5) });
  }
  const ovens = ["ploca-pecnica", "pecnica-donja", "pecnica", "pecnica-mikro", "mikrovalna"];
  if (plan.slots.some((s) => ovens.includes(s.type))) {
    const ap = finishDef("appliances", c.finish?.appliances ?? FINISH_DEFAULTS.appliances);
    if (ap) lines.push({ label: "Fronte aparata", value: `${ap.name} (pećnica, mikrovalna)`, swatch: chip(ap.render.color, ap.render.metalness > 0.5) });
  }
  const pl = finishDef("plinths", c.finish?.plinth ?? FINISH_DEFAULTS.plinth);
  if (pl) {
    const plColour = pl.id === "fronta" ? (frontDef(frontFor(c, "base"))?.render.color ?? pl.render.color) : pl.render.color;
    lines.push({ label: "Postolje", value: pl.name, swatch: chip(plColour, pl.render.metalness > 0.5) });
  }
  const led = catalog.finishes.leds.find((l) => l.id === (c.finish?.led ?? FINISH_DEFAULTS.led));
  lines.push(
    c.led
      ? { label: "LED rasvjeta", value: `${led?.name ?? "da"} — ispod gornjih elemenata, u postolju i nišama`, swatch: led ? chip(led.color) : undefined }
      : { label: "LED rasvjeta", value: "Bez LED rasvjete" },
  );
  const railWalls = plan.runs.filter((r) => r.rail).map((r) => `zid ${r.wall.toUpperCase()} (${fmtCm((r.rail?.to ?? 0) - (r.rail?.from ?? 0))} cm)`);
  if (railWalls.length) lines.push({ label: "Reling s kukama", value: railWalls.join(", ") });

  // heights
  const H = plan.heights;
  const hParts = [`radna ploča ${fmtCm(H.worktop)} cm od poda`, `gornji elementi ${fmtCm(H.upperBottom)}–${fmtCm(H.upperTop)} cm`];
  if (H.topRow) hParts.push(`nadgradni ormarići do ${fmtCm(H.topRow.to)} cm`);
  if (plan.slots.some((s) => s.zone === "tall")) hParts.push(`visoki elementi do ${fmtCm(H.tallTop)} cm`);
  if (H.cornice) hParts.push("lajsna do stropa");
  lines.push({ label: H.mode === "do-stropa" ? "Visine (do stropa)" : "Visine", value: hParts.join(" · ") });

  // the room in the pictures (not part of the kitchen)
  const room = c.room;
  const roomParts: string[] = [];
  let roomChip: SwatchSpec | undefined;
  if (room?.wall) {
    const w = roomWallDef(room.wall);
    if (w) {
      roomParts.push(`zidovi: ${w.name.toLowerCase()}`);
      roomChip = chip(w.color);
    }
  }
  for (const w of plan.walls) {
    const id = room?.walls?.[w];
    const d = id ? roomWallDef(id) : undefined;
    if (d) roomParts.push(`zid ${w.toUpperCase()}: ${d.name.toLowerCase()}`);
  }
  if (room?.floor) {
    const f = roomFloorDef(room.floor);
    if (f) roomParts.push(`pod: ${f.name.toLowerCase()}`);
  }
  if (roomParts.length) lines.push({ label: "Prostor na slikama", value: `${roomParts.join(", ")} — samo za dojam, nije dio kuhinje`, swatch: roomChip });

  // every value reads as a sentence ("Ugradbena napa …", "Radna ploča 90 cm …"), like the catalogue's own names
  return { cards, lines: lines.map((l) => ({ ...l, value: l.value.charAt(0).toLocaleUpperCase("hr") + l.value.slice(1) })) };
}

/* ------------------------------------------------------------------ price */

export function priceInfo(cfg: KitchenConfig, plan: KitchenPlan): PriceInfo {
  const est = estimate(cfg);
  const b = breakdown(cfg);
  const included: string[] = [];
  const add = (v: number, s: string) => {
    if (v > 0.5) included.push(s);
  };
  add(b.cabinets, "elementi: korpusi i fronte");
  add(b.mechanisms, "okovi i mehanizmi (ladice, klapne, kutni mehanizmi)");
  add(b.handles, "ručke, odnosno sustav otvaranja");
  add(b.worktop, "radna ploča");
  add(b.backsplash, "zidna obloga");
  add(b.glass, "staklo vitrina");
  add(b.finishes, "završne obrade okova, sudoper i slavina, postolje");
  add(b.led, "LED rasvjeta");
  add(b.island, `izrada ${isPeninsula(cfg.layout) ? "poluotoka" : "otoka"}`);
  add(b.hoods, "ugradnja nape (bez uređaja)");
  add(b.rails, "reling s kukama");
  add(b.install, "dostava i montaža");
  const excluded = ["kućanski aparati (hladnjak, pećnica, mikrovalna, perilice, ploča za kuhanje, napa)"];
  if (plan.island?.seats.length) excluded.push(plan.island.seats[0].kind === "stool" ? "barske stolice" : "stolice");
  return { low: est.low, high: est.high, text: formatPrice(est), confirmed: PRICES_CONFIRMED, included, excluded };
}

/* ------------------------------------------------------------------ the whole content */

/** the next steps — the site's own words (components/pages/ProcessSteps.tsx collaborationSteps) */
export const NEXT_STEPS: { title: string; text: string }[] = [
  { title: "Razgovor i izmjera", text: "Javljamo se s pitanjima i dogovaramo izmjeru u vašem prostoru." },
  {
    title: "Projekt i ponuda",
    text: "Dobivate 3D projekt i ponudu u kojoj je svaka stavka navedena zasebno. Projekt doradimo dok ne bude onakav kakav želite.",
  },
  { title: "Izrada i montaža", text: "Nakon potvrde projekta izrađujemo elemente prema vašim mjerama, montiramo ih i podešavamo." },
];

export function kitchenPdfContent(cfg: KitchenConfig, opts: ContentOptions, plan: KitchenPlan = planKitchen(cfg)): KitchenPdfContent {
  const c = plan.cfg;
  // each wall of the room; where the kitchen takes only part of it, how much ("zid B 450 cm (kuhinja 300 cm)")
  const dims = plan.walls.map((w: WallId, i) => {
    const run = plan.runs.find((r) => r.wall === w);
    const part = run && run.kitchen.to - run.kitchen.from < c.walls[w] - 0.5 ? ` (kuhinja ${fmtCm(run.kitchen.to - run.kitchen.from)} cm)` : "";
    return `${i === 0 ? "Zid" : "zid"} ${w.toUpperCase()} ${fmtCm(c.walls[w])} cm${part}`;
  });
  // the island / peninsula length, then the ceiling
  if (plan.island) dims.push(`${isPeninsula(c.layout) ? "poluotok" : "otok"} ${fmtCm(plan.island.length)} cm`);
  dims.push(`strop ${fmtCm(c.ceiling)} cm`);
  const groups = elementGroups(plan);
  const elementCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const front = frontDef(c.front);
  const top = topDef(c.top);
  const twoTone = new Set((["base", "upper", "tall", "island"] as FrontZone[]).filter((z) => plan.slots.some((s) => s.zone === z)).map((z) => frontFor(c, z))).size > 1;
  const price = opts.showPrice ? priceInfo(cfg, plan) : null;
  const facts: PdfFact[] = [
    { label: "Fronte", value: `${front?.name ?? c.front}${twoTone ? " i druge" : ""}` },
    { label: "Radna ploča", value: top?.name ?? c.top },
    { label: "Elementi", value: elementsWord(elementCount) },
  ];
  if (price) facts.push({ label: "Okvirna cijena", value: price.text });
  return {
    layout: c.layout,
    layoutName: LAYOUT_NAME[c.layout],
    dimensions: dims.join(" · "),
    facts,
    elementCount,
    groups,
    materials: materials(plan),
    price,
    warnings: [...plan.warnings],
    steps: NEXT_STEPS,
  };
}
