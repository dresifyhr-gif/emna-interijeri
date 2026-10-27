/**
 * Quote line items from a 3D-studio kitchen (leads.config) — the starting point the owner edits.
 *
 *   const pre = quoteFromConfig(lead.config, { vatPct: 25, fallbackPrice: { low, high }, summary });
 *   pre.items   → QuoteItem[] (NET unit prices in cents, as quote-math expects)
 *
 * It walks the same plan the studio draws and prices (lib/studio/plan.ts planKitchen + price.ts
 * breakdown), one line per wall and zone ("Donji elementi – zid A (380 cm)" with every cabinet in the
 * details, each zone in its own front for two-tone kitchens, empty space left out as price.ts does; kitchens
 * "do stropa" add their top cabinets and the cornice strip), then mechanisms, worktop, backsplash, handles, finishes (handle colour, sink and tap, plinth), LED,
 * island / peninsula (its slab, outer row of cabinets, end panels, bar or lowered table, ceiling hood mounting —
 * price.ts islandCost), the glass of vitrines (kind / frame), visible wall hoods and downdraft hobs, hanging rails, and
 * installation. An element's own options (glass, opening style, top-box depth, hob hood, shelves) are named in its row.
 *
 * Every category total comes from price.ts `breakdown()`, so the quote adds up to what the studio
 * showed the customer even when the catalogue rates change; the per-metre rates are only used to
 * split a category over its lines. Catalogue prices include PDV (see lib/studio/catalog.ts), quote
 * unit prices do not, so each price is divided by (1 + PDV).
 *
 * lib/studio is still being extended, so this is defensive: anything unexpected (a throw, NaN, a
 * total that no longer matches) falls back to one "Kuhinja po mjeri" line with the estimate.
 * Pure TypeScript: no DB, no DOM.
 */
import type { QuoteItem } from "@/lib/db/schema";
import {
  FINISH_DEFAULTS,
  backsplashDef,
  catalog,
  defaultHandleColor,
  finishDef,
  frontDef,
  glassFrameDef,
  glassTypeDef,
  handleColorDef,
  handleDef,
  hoodFinishDef,
  hoodKindDef,
  moduleDef,
  topDef,
  worktopThicknessDef,
  type MaterialDef,
} from "@/lib/studio/catalog";
import {
  DIM,
  backsplashOfCfg,
  frontFor,
  glassOf,
  hasTopBox,
  isPeninsula,
  kitchenRange,
  ledZoneOn,
  parseRunEnd,
  planKitchen,
  sanitizeConfig,
  tallListEnd,
  tallSplitOf,
  topDepthOf,
  worktopThickness,
  type PlanSlot,
} from "@/lib/studio/plan";
import {
  TOP_BOX_HARDWARE,
  backsplashArea,
  backsplashRate,
  boardsCost,
  breakdown,
  estimate,
  glassCost,
  heightScale,
  hoodsCost,
  islandCost,
  optionsCost,
  railMetres,
  slotHandle,
  topDepthFactor,
  worktopFactor,
} from "@/lib/studio/price";
import { elementOptionsText, summarize } from "@/lib/studio/summary";
import type { FrontZone, KitchenConfig, Layout } from "@/lib/studio/types";

export interface QuotePrefill {
  items: QuoteItem[];
  /** "plan": itemised from the kitchen plan · "estimate": one line with the studio estimate · "empty": nothing usable */
  mode: "plan" | "estimate" | "empty";
  title: string;
  /** suggested customer-facing note (appliances not included, confirm after measuring) */
  notes: string | null;
  /** planner notes ("Visoki stup ne stane …") for the owner, shown next to the editor */
  warnings: string[];
  /** what the studio showed the customer, gross EUR (incl. PDV) — for the "matches the estimate" hint */
  studioGrossEur: number | null;
}

export interface QuotePrefillOptions {
  /** PDV the quote will use (catalogue prices include it) */
  vatPct: number;
  /** stored studio estimate in whole EUR (leads.price_low/high) — used when the config cannot be planned */
  fallbackPrice?: { low: number | null; high: number | null } | null;
  /** stored summary lines (leads.summary) — details of the fallback line */
  summary?: readonly string[] | null;
  newId?: () => string;
}

/**
 * share of the front's price per metre that each zone uses — mirror of ZONE_FACTOR in lib/studio/price.ts, times
 * price.ts heightScale for taller cabinets (the lines are scaled to b.cabinets anyway)
 */
const ZONE_WEIGHT = { base: 0.6, upper: 0.4, tall: 1.6, island: 0.8, filler: 0.25 } as const;

const LAYOUT_TITLE: Record<Layout, string> = {
  ravna: "ravna kuhinja",
  L: "kuhinja u obliku slova L",
  U: "kuhinja u obliku slova U",
  otok: "kuhinja s otokom",
  poluotok: "kuhinja s poluotokom",
  G: "kuhinja u obliku slova G",
};

const APPLIANCES_NOTE =
  "Kućanski aparati (hladnjak, pećnica, perilica posuđa, ploča za kuhanje i napa) nisu uključeni u cijenu; uključena je njihova ugradnja.";
const MEASURE_NOTE = "Stavke su složene prema kuhinji iz 3D studija. Konačne mjere i cijena potvrđuju se nakon izmjere na licu mjesta.";

const defaultId = () => globalThis.crypto.randomUUID();
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const round2 = (n: number) => Math.round(n * 100) / 100;
const cmToM = (cm: number) => cm / 100;
const cmFmt = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 1 });

/**
 * Per-unit rate of a line: `total` (the line's share of a category) over its (rounded) quantity, but the plain
 * catalogue rate when that changes the line by less than 0,50 € — so "Radna ploča" reads 416 €/m, not 415,99,
 * and the lines still add up to the studio total (no stray "Ostalo" line of a few euros from rounding).
 */
function rate(total: number, qty: number, catalogue: number | null): number {
  if (catalogue !== null && finite(catalogue) && catalogue > 0 && Math.abs(catalogue * qty - total) < 0.5) return catalogue;
  return total / qty;
}

/** gross EUR (with PDV) → net cents */
function netCents(grossEur: number, vatPct: number): number {
  return Math.round((grossEur * 100 * 100) / (100 + vatPct));
}

interface DraftLine {
  description: string;
  details?: string;
  qty: number;
  unit: string;
  /** gross EUR per unit, before the PDV split */
  grossUnit: number;
}

const defOf = (s: PlanSlot) => moduleDef(s.zone, s.type);
const isSpacer = (s: PlanSlot) => Boolean(defOf(s)?.spacer);

function slotName(s: PlanSlot): string {
  const def = defOf(s);
  const name = (def?.name ?? s.type).toLowerCase();
  // a door or a vitrine in a blind corner is still a corner unit (same wording as lib/studio/summary.ts)
  return s.corner && def && !def.corner ? `kutni element, ${name}` : name;
}

/** "kutni karusel 110, element za sudoper 80 (širine u cm)" — empty space ("slobodno mjesto") is named at the end */
function slotList(slots: readonly PlanSlot[], cfg?: KitchenConfig): string {
  const cabinets = slots.filter((s) => !isSpacer(s));
  const free = slots.filter(isSpacer).reduce((sum, s) => sum + s.width, 0);
  // an element's own options (glass, opening style …: lib/studio/summary.ts elementOptionsText) in brackets after it
  const own = (s: PlanSlot) => {
    const t = cfg ? elementOptionsText(cfg, s) : null;
    return t ? ` [${t}]` : "";
  };
  const list = cabinets.length ? `${cabinets.map((s) => `${slotName(s)} ${cmFmt.format(s.width)}${own(s)}`).join(", ")} (širine u cm)` : "";
  const gap = free >= 1 ? `bez elementa ${cmFmt.format(Math.round(free))} cm` : "";
  return [list, gap].filter(Boolean).join("; ");
}

function titleFor(cfg: KitchenConfig | null): string {
  return cfg && LAYOUT_TITLE[cfg.layout] ? `Kuhinja po mjeri – ${LAYOUT_TITLE[cfg.layout]}` : "Kuhinja po mjeri";
}

/** the itemised lines; throws on anything it does not understand (the caller falls back) */
function planLines(cfg: KitchenConfig): { lines: DraftLine[]; totalGross: number; warnings: string[] } {
  const plan = planKitchen(cfg);
  const c = plan.cfg ?? cfg;
  const b = breakdown(c);
  const front = frontDef(c.front) ?? catalog.fronts[0];
  const top = topDef(c.top) ?? catalog.tops[0];
  const handle = handleDef(c.handles) ?? catalog.handles[0];
  if (!front || !top || !handle) throw new Error("catalogue is empty");
  if (!Array.isArray(plan.slots) || !Array.isArray(plan.runs) || !Array.isArray(plan.pieces)) throw new Error("unexpected plan shape");
  for (const v of [b.cabinets, b.worktop, b.backsplash, b.handles, b.mechanisms, b.finishes ?? 0, b.led, b.install, b.island, b.glass ?? 0, b.hoods ?? 0, b.rails ?? 0, b.options ?? 0, b.total]) {
    if (!finite(v) || v < 0) throw new Error("unexpected breakdown");
  }

  const lines: DraftLine[] = [];
  /** the front a zone wears (two-tone kitchens: lib/studio/plan.ts frontFor) */
  const frontOf = (z: FrontZone): MaterialDef => frontDef(frontFor(c, z)) ?? front;
  /** metres of a slot that carry a front (open units count less) — the same measure price.ts uses */
  const frontedM = (s: PlanSlot) => cmToM(s.width) * (defOf(s)?.frontShare ?? 1);
  const cabinetsOnly = plan.slots.filter((s) => !isSpacer(s));

  /* ---------------- cabinets: one line per wall and zone; each group priced exactly as price.ts, then scaled to b.cabinets */
  type Group = { description: string; details: string; metres: number; gross: number; catalogueRate: number };
  const groups: Group[] = [];
  // taller cabinets (KitchenConfig.heights) cost more per metre: the same factors as price.ts (all 1 for standard heights)
  const hp = plan.heights;
  const hs = heightScale(plan);
  const heightNote: Partial<Record<FrontZone, string>> = {};
  if (hs.upper !== 1) heightNote.upper = `visina ${cmFmt.format(hp.upperTop - hp.upperBottom)} cm`;
  if (hs.tall !== 1) heightNote.tall = `do ${cmFmt.format(hp.tallTop)} cm od poda`;
  const addGroup = (description: string, slots: PlanSlot[], zone: FrontZone, weight: number) => {
    const priced = slots.filter((s) => !isSpacer(s));
    if (priced.length === 0) return;
    const f = frontOf(zone);
    const h = heightNote[zone];
    groups.push({
      description,
      details: `${slotList(slots, c)}${h ? ` · ${h}` : ""} · fronta: ${f.name}`,
      metres: cmToM(priced.reduce((sum, s) => sum + s.width, 0)),
      gross: priced.reduce((sum, s) => sum + f.pricePerMeter * weight * frontedM(s), 0),
      catalogueRate: f.pricePerMeter * weight,
    });
  };
  const walls = Array.isArray(plan.walls) ? plan.walls : [];
  for (const wall of walls) {
    const length = c.walls?.[wall];
    // a kitchen shorter than its wall (KitchenConfig.extents): the run's length, then the wall's
    const k = c.extents?.[wall] ? kitchenRange(c, wall) : null;
    const size = k
      ? ` (kuhinja ${cmFmt.format(k.to - k.from)} cm, zid ${cmFmt.format(length)} cm)`
      : finite(length)
        ? ` (${cmFmt.format(length)} cm)`
        : "";
    const label = `zid ${String(wall).toUpperCase()}${size}`;
    for (const zone of ["base", "upper"] as const) {
      const slots = plan.slots.filter((s) => s.run === wall && s.zone === zone);
      addGroup(`${zone === "base" ? "Donji" : "Gornji"} elementi – ${label}`, slots, zone, ZONE_WEIGHT[zone] * hs[zone]);
    }
  }
  addGroup("Visoki elementi", plan.slots.filter((s) => s.zone === "tall" && s.list?.id === "tall"), "tall", ZONE_WEIGHT.tall * hs.tall);
  // tall units standing in a wall's base run (CabinetSpec.tall: a fridge / oven column between the base cabinets): a line per wall
  for (const wall of walls) {
    addGroup(
      `Visoki elementi u nizu – zid ${String(wall).toUpperCase()}`,
      plan.slots.filter((s) => s.zone === "tall" && s.run === wall && s.list?.id === wall),
      "tall",
      ZONE_WEIGHT.tall * hs.tall,
    );
  }
  // more tall columns at other run ends (KitchenConfig.tallRuns): a line each
  for (const l of plan.lists) {
    const end = tallListEnd(l.id);
    if (!end) continue;
    const { wall, side } = parseRunEnd(end);
    addGroup(
      `Visoki elementi – zid ${wall.toUpperCase()}, ${side === "left" ? "lijevi" : "desni"} kraj`,
      plan.slots.filter((s) => s.zone === "tall" && s.list?.id === l.id),
      "tall",
      ZONE_WEIGHT.tall * hs.tall,
    );
  }
  const islandWord = isPeninsula(c.layout) ? "Poluotok" : "Otok";
  addGroup(`${islandWord} – elementi`, plan.slots.filter((s) => s.zone === "island"), "island", ZONE_WEIGHT.island);
  const ic = islandCost(plan);
  // "do stropa": the top cabinets (nadgradni ormarići) on the wall units and above a split tall column, as price.ts counts them
  const topUpper = hs.top > 0 ? cabinetsOnly.filter((s) => s.zone === "upper" && hasTopBox(s.type)) : [];
  // (tall units in one piece up to the ceiling have no top box: HeightSpec.onePiece / opt.onePiece — their own line below)
  const topTall = hp.tallSplit !== null ? cabinetsOnly.filter((s) => s.zone === "tall" && tallSplitOf(c, hp, s.opt) !== null) : [];
  if (topUpper.length + topTall.length > 0) {
    const fu = frontOf("upper");
    const u = topUpper.length ? `${topUpper.length} kom iznad gornjih` : "";
    const t = topTall.length ? `${topTall.length} kom iznad visokih` : "";
    const where = `${[u, t].filter(Boolean).join(" i ")} elemenata`;
    const rowH = hp.topRow ? hp.topRow.to - hp.topRow.from : hp.tallTop - (hp.tallSplit ?? hp.tallTop);
    const names = [...new Set([...(topUpper.length ? [fu.name] : []), ...(topTall.length ? [frontOf("tall").name] : [])])];
    const depths = [...new Set(topUpper.map((s) => (s.corner ? 35 : topDepthOf(c, s.opt))))].sort((a, b) => a - b);
    const depthNote = depths.length && !(depths.length === 1 && depths[0] === 35) ? `, dubina ${depths.join(" / ")} cm` : "";
    groups.push({
      description: "Nadgradni ormarići do stropa",
      details: `${where}, visina ${cmFmt.format(rowH)} cm${depthNote}, s klapnom koja se diže · fronta: ${names.join(", ")}`,
      metres: cmToM([...topUpper, ...topTall].reduce((sum, s) => sum + s.width, 0)),
      gross:
        topUpper.reduce(
          (sum, s) => sum + fu.pricePerMeter * ZONE_WEIGHT.upper * cmToM(s.width) * hs.top * (s.corner ? 1 : topDepthFactor(topDepthOf(c, s.opt))) + TOP_BOX_HARDWARE,
          0,
        ) + topTall.length * TOP_BOX_HARDWARE,
      catalogueRate: 0,
    });
  }
  if (hp.cornices.length) {
    const names = [...new Set(hp.cornices.map((c) => frontOf(c.zone).name))];
    groups.push({
      description: "Lajsna do stropa",
      details: `${hp.cornice ? `visina ${cmFmt.format(hp.cornice.to - hp.cornice.from)} cm, ` : ""}u boji fronte (${names.join(", ")})`,
      metres: cmToM(hp.cornices.reduce((sum, c) => sum + (c.to - c.from), 0)),
      gross: hp.cornices.reduce((sum, c) => sum + frontOf(c.zone).pricePerMeter * ZONE_WEIGHT.filler * cmToM(c.to - c.from), 0),
      catalogueRate: names.length === 1 ? frontOf(hp.cornices[0].zone).pricePerMeter * ZONE_WEIGHT.filler : 0,
    });
  }
  const fillerM = cmToM(plan.pieces.reduce((sum, p) => sum + p.width, 0));
  if (fillerM > 0.005) {
    const pieceZone = (p: (typeof plan.pieces)[number]): FrontZone => (p.run === "isl" ? "island" : p.zone);
    const names = [...new Set(plan.pieces.map((p) => frontOf(pieceZone(p)).name))];
    groups.push({
      description: "Ispune i završne bočne ploče",
      details: `u boji fronte (${names.join(", ")})`,
      metres: fillerM,
      gross: plan.pieces.reduce((sum, p) => sum + frontOf(pieceZone(p)).pricePerMeter * ZONE_WEIGHT.filler * cmToM(p.width), 0),
      catalogueRate: names.length === 1 ? frontOf(pieceZone(plan.pieces[0])).pricePerMeter * ZONE_WEIGHT.filler : 0,
    });
  }
  const grossSum = groups.reduce((sum, g) => sum + g.gross, 0);
  // the island's outer row of cabinets and its end panels are in b.cabinets too: their own lines, the rest split as above
  const islandCabinets = (ic?.backRow ?? 0) + (ic?.endPanels ?? 0);
  const cabinetsRest = b.cabinets - islandCabinets;
  if (cabinetsRest > 0 && !(grossSum > 0)) throw new Error("cabinets without metres");
  for (const g of groups) {
    const qty = round2(g.metres);
    if (!(qty > 0)) continue;
    // the group's share of b.cabinets (the same sum, so the scale is 1 up to rounding)
    const share = (cabinetsRest * g.gross) / grossSum;
    lines.push({ description: g.description, details: g.details, qty, unit: "m", grossUnit: rate(share, qty, g.catalogueRate || null) });
  }
  const I = plan.island;
  if (ic && I?.backRow && ic.backRow > 0.5) {
    const qty = round2(cmToM(I.backRow.to - I.backRow.from));
    if (!(qty > 0)) throw new Error("back row without metres");
    lines.push({
      description: `${islandWord} – stražnji ormarići`,
      details: `${I.backRow.doors.length} vrata s otvaranjem na dodir (TIP-ON), dubina ${cmFmt.format(I.backRow.depth)} cm, s vanjske strane · fronta: ${frontOf("island").name}`,
      qty,
      unit: "m",
      grossUnit: ic.backRow / qty,
    });
  }
  if (ic && I && ic.endPanels > 0.5) {
    lines.push({
      description: `${islandWord} – bočne ploče`,
      details: `u boji fronte (${frontOf("island").name}), od poda do radne ploče`,
      qty: I.endPanels.length,
      unit: "kom",
      grossUnit: ic.endPanels / I.endPanels.length,
    });
  }

  /* ---------------- mechanisms: one line per module type with a surcharge */
  const mech = new Map<string, { name: string; description: string; count: number; price: number }>();
  for (const s of cabinetsOnly) {
    const def = defOf(s);
    if (!def || !(def.priceAdd > 0)) continue;
    const key = `${def.zone}:${def.id}`;
    const hit = mech.get(key);
    if (hit) hit.count++;
    else mech.set(key, { name: def.name, description: def.description, count: 1, price: def.priceAdd });
  }
  for (const m of mech.values()) {
    lines.push({ description: `Oprema – ${m.name}`, details: m.description, qty: m.count, unit: "kom", grossUnit: m.price });
  }
  // floating shelves: their boards by the metre (price.ts boardsCost, in b.mechanisms)
  const boards = cabinetsOnly.filter((s) => boardsCost(s) > 0);
  if (boards.length) {
    const boardM = round2(boards.reduce((sum, s) => sum + boardsCost(s), 0) / catalog.extras.shelfBoardPerMeter);
    lines.push({
      description: "Viseće police – daske s LED trakom",
      details: `${boards.length} ${boards.length === 1 ? "element" : "elementa"}, ukupno ${cmFmt.format(boardM)} m dasaka`,
      qty: boardM,
      unit: "m",
      grossUnit: catalog.extras.shelfBoardPerMeter,
    });
  }

  /* ---------------- glass of glass-door elements: kind and frame surcharges (b.glass) */
  if (b.glass > 0.5) {
    const glassBy = new Map<string, { label: string; metres: number; gross: number }>();
    for (const s of cabinetsOnly) {
      const g = glassCost(c, s);
      if (!(g > 0)) continue;
      const v = glassOf(c, s.opt);
      const key = `${v.type}:${v.frame}`;
      const label = `${glassTypeDef(v.type)?.name ?? v.type}${v.frame !== "fronta" ? `, okvir ${(glassFrameDef(v.frame)?.name ?? v.frame).toLowerCase()}` : ""}`;
      const hit = glassBy.get(key) ?? { label, metres: 0, gross: 0 };
      hit.metres += cmToM(s.width);
      hit.gross += g;
      glassBy.set(key, hit);
    }
    for (const g of glassBy.values()) {
      const qty = round2(g.metres);
      if (!(qty > 0)) continue;
      lines.push({ description: `Staklo vitrina – ${g.label}`, details: "doplata za vrstu stakla i okvir, po dužnom metru vitrine", qty, unit: "m", grossUnit: g.gross / qty });
    }
  }

  /* ---------------- visible wall hoods, downdraft hobs (b.hoods); hanging rails (b.rails) */
  for (const h of hoodsCost(plan)) {
    if (!(h.each > 0.5)) continue;
    const def = hoodKindDef(h.kind);
    const finish = hoodFinishDef(c.hood?.finish ?? "inox")?.name.toLowerCase();
    lines.push({
      description: h.kind === "ploca" ? "Ploča s odsisom (downdraft) – ugradnja" : `${def?.name ?? h.kind} – montaža`,
      details:
        h.kind === "ploca"
          ? "izrez, odvod kroz postolje — ploča s odsisom nije uključena"
          : `pričvršćenje na zid, maska dimnjaka do stropa, odvod${finish ? ` · ${finish}` : ""} — napa nije uključena`,
      qty: h.count,
      unit: "kom",
      grossUnit: h.each,
    });
  }
  if (b.rails > 0.5) {
    const qty = round2(railMetres(plan));
    if (!(qty > 0)) throw new Error("rails without metres");
    lines.push({ description: "Reling s kukama", details: "na zidnoj oblozi ispod gornjih elemenata, s kukama", qty, unit: "m", grossUnit: b.rails / qty });
  }

  /* ---------------- the "photo" round's options (b.options): one-piece tall units, the Gola channel between drawers, extra drawers */
  for (const o of optionsCost(plan)) {
    if (!(o.qty > 0) || !(o.each > 0)) continue;
    lines.push({ description: o.label, details: o.details, qty: round2(o.qty), unit: o.unit, grossUnit: o.each });
  }

  /* ---------------- worktop (walls by the metre, island slab as one piece) */
  // its pieces (tall units standing in a run interrupt it: RunPlan.worktops); an older plan shape: the one range
  const wallTopM = plan.runs.reduce(
    (sum, r) => sum + (Array.isArray(r.worktops) ? r.worktops.reduce((n, w) => n + cmToM(w.to - w.from), 0) : r.worktop ? cmToM(r.worktop.to - r.worktop.from) : 0),
    0,
  );
  let islandSlab = 0;
  // the bar / table top has its own line (it may be in another material)
  const barTop = ic?.barTop ?? 0;
  // the worktop's thickness (KitchenConfig.worktop) scales its price per metre (price.ts worktopFactor)
  const wf = worktopFactor(c);
  const topRate = top.pricePerMeter * wf;
  const thick = c.worktop ? `, debljina ${worktopThicknessDef(worktopThickness(c))?.name ?? `${worktopThickness(c)} cm`}` : "";
  // side panels in the worktop material at the end of a run (catalog worktopMaterial): their own line
  const stonePanels = cabinetsOnly.filter((s) => defOf(s)?.worktopMaterial);
  const panelStone = stonePanels.length * top.pricePerMeter * catalog.extras.worktopPanelM * wf;
  const worktopRest = b.worktop - panelStone;
  if (worktopRest > 0) {
    const wallQty = round2(wallTopM);
    if (plan.island && wallQty > 0) {
      const wallPart = Math.min(worktopRest - barTop, topRate * wallTopM);
      islandSlab = worktopRest - barTop - wallPart;
      lines.push({
        description: `Radna ploča – ${top.name}`,
        details: `dubina ${cmFmt.format(DIM.worktopDepth)} cm${thick}, uz zidove`,
        qty: wallQty,
        unit: "m",
        grossUnit: rate(wallPart, wallQty, topRate),
      });
    } else if (plan.island) {
      islandSlab = worktopRest - barTop;
    } else if (wallQty > 0) {
      lines.push({
        description: `Radna ploča – ${top.name}`,
        details: `dubina ${cmFmt.format(DIM.worktopDepth)} cm${thick}`,
        qty: wallQty,
        unit: "m",
        grossUnit: rate(worktopRest, wallQty, topRate),
      });
    } else {
      throw new Error("worktop without metres");
    }
  }
  if (panelStone > 0.5) {
    lines.push({
      description: `Bočne ploče od radne ploče – ${top.name}`,
      details: "završetak kuhinje: radna ploča se spušta do poda, rezanje i obrada rubova",
      qty: stonePanels.length,
      unit: "kom",
      grossUnit: panelStone / stonePanels.length,
    });
  }
  if (islandSlab > 0.5) {
    const len = plan.island?.length;
    const isl = plan.island;
    // the island of an older link keeps its wording; otherwise what the slab really is
    const details =
      !c.islandSpec && isl?.kind !== "poluotok"
      ? `${finite(len) ? `${cmFmt.format(len)} cm, ` : ""}s bočnim stranicama do poda`
      : [
          finite(len) ? `${cmFmt.format(len)} cm` : null,
          isl ? `dubina ${cmFmt.format(DIM.worktopDepth - Math.min(...isl.slab.map((r) => r.z0)))} cm` : null,
          isl?.waterfalls.length ? (isl.waterfalls.length > 1 ? "s bočnim stranicama do poda" : "s bočnom stranicom do poda na slobodnom kraju") : null,
          isl?.overhang ? `prepust za sjedenje ${cmFmt.format(isl.overhang)} cm` : null,
        ]
          .filter(Boolean)
          .join(", ");
    lines.push({
      description: `Ploča ${isPeninsula(c.layout) ? "poluotoka" : "otoka"} – ${top.name}`,
      details,
      qty: 1,
      unit: "kompl.",
      grossUnit: islandSlab,
    });
  }
  const bar = plan.island?.bar;
  if (bar && barTop > 0.5) {
    const bt = topDef(bar.top) ?? top;
    lines.push({
      description: `${bar.kind === "raised" ? "Ploča šanka" : "Ploča spuštenog stola"} – ${bt.name}`,
      details: `${cmFmt.format(bar.to - bar.from)} × ${cmFmt.format(bar.depth)} cm, na ${cmFmt.format(bar.height)} cm od poda${bar.kind === "table" ? ", s dvije noge u istom materijalu" : ""}`,
      qty: 1,
      unit: "kompl.",
      grossUnit: barTop,
    });
  }

  /* ---------------- backsplash */
  if (b.backsplash > 0.5) {
    const area = round2(backsplashArea(plan));
    if (!(area > 0)) throw new Error("backsplash without area");
    const bs = backsplashOfCfg(c);
    const own = bs.kind === "staklo" || bs.kind === "plocice" ? backsplashDef(bs.finish ?? undefined) : undefined;
    lines.push({
      description: `Zidna obloga – ${own?.name ?? top.name}`,
      details: own
        ? bs.kind === "staklo"
          ? "lakirano staklo između radne ploče i gornjih elemenata, izrada po mjeri i montaža"
          : "pločice između radne ploče i gornjih elemenata, materijal i postavljanje"
        : `između radne ploče i gornjih elemenata${bs.kind === "pola" ? ", do pola visine" : ""}, u materijalu radne ploče`,
      qty: area,
      unit: "m²",
      grossUnit: rate(b.backsplash, area, backsplashRate(c)),
    });
  }

  /* ---------------- handles (per metre of fronts, each element in its own opening style: CabinetSpec.opt.open) */
  const frontM = round2(cabinetsOnly.reduce((sum, s) => sum + frontedM(s), 0));
  const styleM = new Map<string, number>();
  for (const s of cabinetsOnly) {
    const h = slotHandle(c, s);
    if (h) styleM.set(h.id, (styleM.get(h.id) ?? 0) + frontedM(s));
  }
  if (b.handles > 0.5) {
    if (!(frontM > 0)) throw new Error("handles without fronts");
    const styles = [...styleM].filter(([, m]) => m > 0.005);
    if (styles.length <= 1) {
      lines.push({
        description: `Ručke – ${handle.name}`,
        details: "po dužnom metru fronti",
        qty: frontM,
        unit: "m",
        grossUnit: rate(b.handles, frontM, handle.pricePerMeter),
      });
    } else {
      // the kitchen's style first, then the elements that open their own way
      styles.sort(([a], [z]) => (a === c.handles ? -1 : z === c.handles ? 1 : 0));
      for (const [id, metres] of styles) {
        const h = handleDef(id as KitchenConfig["handles"]) ?? handle;
        const qty = round2(metres);
        if (!(qty > 0)) continue;
        lines.push({
          description: `${id === c.handles ? "Ručke" : "Otvaranje elemenata"} – ${h.name}`,
          details: id === c.handles ? "po dužnom metru fronti" : "elementi s vlastitim načinom otvaranja, po dužnom metru fronti",
          qty,
          unit: "m",
          grossUnit: h.pricePerMeter,
        });
      }
    }
  }

  /* ---------------- finishes: handle colour, sink and tap, plinth (b.finishes) */
  if (b.finishes > 0.5) {
    const f = c.finish ?? {};
    const finishLines: DraftLine[] = [];
    const hc = handleColorDef(f.handleColor ?? defaultHandleColor(c.handles));
    // the colour on the fronts of every coloured style (price.ts: the same metres)
    const colouredM = round2([...styleM].reduce((sum, [id, m]) => sum + (handleDef(id as KitchenConfig["handles"])?.coloured ? m : 0), 0));
    if (hc && hc.priceAdd > 0 && colouredM > 0) {
      finishLines.push({
        description: c.handles === "bez" ? `Profil Gola – ${hc.golaName}` : `Boja ručki – ${hc.name}`,
        details: "doplata po dužnom metru fronti",
        qty: colouredM,
        unit: "m",
        grossUnit: hc.priceAdd,
      });
    }
    const sinks = cabinetsOnly.filter((s) => defOf(s)?.feature === "sink").length;
    const sink = finishDef("sinks", f.sink ?? FINISH_DEFAULTS.sink);
    const tap = finishDef("taps", f.tap ?? FINISH_DEFAULTS.tap);
    const sinkAdd = (sink?.priceAdd ?? 0) + (tap?.priceAdd ?? 0);
    if (sinks > 0 && sinkAdd > 0) {
      finishLines.push({
        description: `Sudoper i slavina – ${(sink?.name ?? "").toLowerCase()}, slavina ${(tap?.name ?? "").toLowerCase()}`,
        details: "doplata za izvedbu sudopera i slavine",
        qty: sinks,
        unit: "kom",
        grossUnit: sinkAdd,
      });
    }
    const plinth = finishDef("plinths", f.plinth ?? FINISH_DEFAULTS.plinth);
    const plinthM = round2(cmToM(cabinetsOnly.filter((s) => s.zone !== "upper").reduce((sum, s) => sum + s.width, 0)));
    if (plinth && plinth.priceAdd > 0 && plinthM > 0) {
      finishLines.push({ description: `Postolje – ${plinth.name.toLowerCase()}`, details: "doplata po dužnom metru", qty: plinthM, unit: "m", grossUnit: plinth.priceAdd });
    }
    // the same parts as price.ts; any rounding difference goes into the last line, and a mismatch falls back to one line
    const known = finishLines.reduce((sum, l) => sum + l.qty * l.grossUnit, 0);
    if (finishLines.length && Math.abs(known - b.finishes) <= Math.max(1, b.finishes * 0.01)) lines.push(...finishLines);
    else lines.push({ description: "Završna obrada – ručke, sudoper i slavina, postolje", qty: 1, unit: "paušal", grossUnit: b.finishes });
  }

  /* ---------------- LED: strip by the metre + drivers and switches */
  if (b.led > 0.5) {
    const upperM = cmToM(cabinetsOnly.filter((s) => s.zone === "upper").reduce((sum, s) => sum + s.width, 0));
    const stripM = round2(Math.max(upperM, 0.6));
    const fixed = Math.min(b.led, catalog.extras.ledFixed);
    const strip = b.led - fixed;
    if (strip > 0.5) {
      // the zones that are lit (KitchenConfig.ledZones; every older link: all three)
      const zones = [ledZoneOn(c, "under") ? "ispod gornjih elemenata" : null, ledZoneOn(c, "plinth") ? "u postolju" : null, ledZoneOn(c, "inner") ? "u nišama i vitrinama" : null].filter(Boolean);
      const where = zones.length === 3 ? "ispod gornjih elemenata, u postolju i nišama" : zones.join(", ");
      lines.push({
        description: "LED rasvjeta – traka",
        details: where,
        qty: stripM,
        unit: "m",
        grossUnit: rate(strip, stripM, c.ledZones ? null : catalog.extras.ledPerMeter),
      });
    }
    if (fixed > 0.5) {
      lines.push({ description: "LED rasvjeta – napajanje i prekidači", qty: 1, unit: "kompl.", grossUnit: fixed });
    }
  }

  /* ---------------- island extras (b.island = fixed + bar / table fitting + ceiling hood mounting) */
  if (b.island > 0.5) {
    const isl = plan.island;
    const fixed = ic ? ic.fixed : b.island;
    if (!isl || (!c.islandSpec && isl.kind === "otok")) {
      lines.push({
        description: "Otok – stražnja ploča i prepust za sjedenje",
        details: "obloga stražnje strane otoka i prepust radne ploče za barske stolice",
        qty: 1,
        unit: "paušal",
        grossUnit: fixed,
      });
    } else {
      const of = isPeninsula(c.layout) ? "poluotoka" : "otoka";
      const parts = [
        isl.backPanel ? `obloga stražnje strane ${of}` : `zatvaranje stražnjih ormarića ${of}`,
        isl.overhang > 0 ? "prepust radne ploče za barske stolice" : null,
        isl.waterfalls.length ? "bočne stranice od radne ploče" : null,
        isl.functions.sink || isl.functions.hob ? "izrezi i priprema za ugradnju u radnu ploču" : null,
      ].filter(Boolean);
      lines.push({ description: `${islandWord} – izrada i montaža`, details: parts.join(", "), qty: 1, unit: "paušal", grossUnit: fixed });
    }
    if (ic && isl?.bar && ic.barBuild > 0.5) {
      lines.push(
        isl.bar.kind === "raised"
          ? {
              description: "Šank – nadogradnja i nosači",
              details: `nadogradnja u boji fronte na radnoj ploči, ${isl.bar.brackets.length} ${isl.bar.brackets.length >= 5 ? "čeličnih" : "čelična"} nosača ispod ploče šanka, montaža`,
              qty: 1,
              unit: "paušal",
              grossUnit: ic.barBuild,
            }
          : {
              description: "Spušteni stol – montaža",
              details: `pričvršćivanje uz ${isPeninsula(c.layout) ? "poluotok" : "otok"} i noge stola`,
              qty: 1,
              unit: "paušal",
              grossUnit: ic.barBuild,
            },
      );
    }
    if (ic && isl?.hood && ic.hood > 0.5) {
      lines.push(
        isl.hood.style === "kaseta"
          ? {
              description: "Montaža stropne kasete (napa u stropu)",
              details: "izrez i ugradnja u strop iznad otoka, odvod — napa nije uključena",
              qty: 1,
              unit: "paušal",
              grossUnit: ic.hood,
            }
          : {
              description: "Montaža otočne nape (stropna)",
              details: `pričvršćenje na strop, maska dimnjaka do stropa, odvod — napa nije uključena · donji rub ${cmFmt.format(isl.hood.bottom)} cm od poda`,
              qty: 1,
              unit: "paušal",
              grossUnit: ic.hood,
            },
      );
    }
  }

  /* ---------------- delivery + installation */
  if (b.install > 0.5) {
    lines.push({
      description: "Dostava i montaža",
      details: "dostava, montaža elemenata i ugradnja kućanskih aparata",
      qty: 1,
      unit: "paušal",
      grossUnit: b.install,
    });
  }

  /* ---------------- anything price.ts counts that this file does not know (yet) */
  const known = lines.reduce((sum, l) => sum + l.qty * l.grossUnit, 0);
  const rest = b.total - known;
  if (rest >= 1) {
    lines.push({ description: "Ostalo prema 3D studiju", qty: 1, unit: "paušal", grossUnit: rest });
  } else if (rest < -Math.max(1, b.total * 0.02)) {
    throw new Error("itemised lines exceed the studio total");
  }

  if (lines.length === 0) throw new Error("no lines");
  for (const l of lines) if (!finite(l.qty) || !finite(l.grossUnit) || l.qty <= 0 || l.grossUnit < 0) throw new Error("bad line");

  const warnings = Array.isArray(plan.warnings) ? plan.warnings.filter((w): w is string => typeof w === "string") : [];
  return { lines, totalGross: b.total, warnings };
}

function toItems(lines: readonly DraftLine[], vatPct: number, newId: () => string): QuoteItem[] {
  return lines.map((l) => ({
    id: newId(),
    description: l.description,
    ...(l.details ? { details: l.details } : {}),
    qty: l.qty,
    unit: l.unit,
    unit_price_cents: Math.max(0, netCents(l.grossUnit, vatPct)),
    discount_pct: 0,
  }));
}

/** one "Kuhinja po mjeri" line priced at the middle of the studio estimate (net) */
function estimateItem(
  grossEur: number | null,
  summary: readonly string[] | null | undefined,
  vatPct: number,
  newId: () => string,
): QuoteItem {
  const details = (summary ?? [])
    .map((l) => String(l).replace(/[\r\n\t]+/g, " ").trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 2000);
  return {
    id: newId(),
    description: "Kuhinja po mjeri",
    ...(details ? { details } : {}),
    qty: 1,
    unit: "kompl.",
    unit_price_cents: grossEur && grossEur > 0 ? netCents(grossEur, vatPct) : 0,
    discount_pct: 0,
  };
}

function midpoint(p: { low: number | null; high: number | null } | null | undefined): number | null {
  if (!p) return null;
  const lo = finite(p.low) ? p.low : null;
  const hi = finite(p.high) ? p.high : null;
  if (lo === null && hi === null) return null;
  const v = lo !== null && hi !== null ? (lo + hi) / 2 : (lo ?? hi)!;
  return v > 0 ? v : null;
}

/**
 * Prefilled items for a studio inquiry. Never throws: a config it cannot use gives one estimate
 * line (or `mode: "empty"` with no items when there is not even an estimate).
 */
export function quoteFromConfig(config: unknown, opts: QuotePrefillOptions): QuotePrefill {
  const vatPct = finite(opts.vatPct) ? Math.min(100, Math.max(0, opts.vatPct)) : 25;
  const newId = opts.newId ?? defaultId;
  const notes = `${APPLIANCES_NOTE}\n${MEASURE_NOTE}`;

  let cfg: KitchenConfig | null = null;
  // only something that looks like a stored kitchen; sanitizeConfig would turn anything else into the default kitchen
  const raw = config && typeof config === "object" ? (config as Record<string, unknown>) : null;
  if (raw && typeof raw.layout === "string" && raw.walls && typeof raw.walls === "object") {
    try {
      cfg = sanitizeConfig(config);
    } catch {
      cfg = null;
    }
  }

  if (cfg) {
    try {
      const { lines, totalGross, warnings } = planLines(cfg);
      return { items: toItems(lines, vatPct, newId), mode: "plan", title: titleFor(cfg), notes, warnings, studioGrossEur: totalGross };
    } catch {
      /* fall through to the estimate */
    }
  }

  let gross: number | null = null;
  let summary = opts.summary ?? null;
  if (cfg) {
    try {
      gross = midpoint(estimate(cfg));
    } catch {
      gross = null;
    }
    if (!summary?.length) {
      try {
        summary = summarize(cfg);
      } catch {
        summary = null;
      }
    }
  }
  gross ??= midpoint(opts.fallbackPrice);

  if (gross === null && !summary?.length) {
    return { items: [], mode: "empty", title: titleFor(cfg), notes: cfg ? notes : null, warnings: [], studioGrossEur: null };
  }
  return {
    items: [estimateItem(gross, summary, vatPct, newId)],
    mode: "estimate",
    title: titleFor(cfg),
    notes,
    warnings: [],
    studioGrossEur: gross,
  };
}
