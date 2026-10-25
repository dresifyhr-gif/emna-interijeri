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
 * island and installation.
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
  catalog,
  defaultHandleColor,
  finishDef,
  frontDef,
  handleColorDef,
  handleDef,
  moduleDef,
  topDef,
  type MaterialDef,
} from "@/lib/studio/catalog";
import { DIM, frontFor, hasTopBox, planKitchen, sanitizeConfig, type PlanSlot } from "@/lib/studio/plan";
import { TOP_BOX_HARDWARE, backsplashArea, breakdown, estimate, heightScale } from "@/lib/studio/price";
import { summarize } from "@/lib/studio/summary";
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
function slotList(slots: readonly PlanSlot[]): string {
  const cabinets = slots.filter((s) => !isSpacer(s));
  const free = slots.filter(isSpacer).reduce((sum, s) => sum + s.width, 0);
  const list = cabinets.length ? `${cabinets.map((s) => `${slotName(s)} ${cmFmt.format(s.width)}`).join(", ")} (širine u cm)` : "";
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
  for (const v of [b.cabinets, b.worktop, b.backsplash, b.handles, b.mechanisms, b.finishes ?? 0, b.led, b.install, b.island, b.total]) {
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
      details: `${slotList(slots)}${h ? ` · ${h}` : ""} · fronta: ${f.name}`,
      metres: cmToM(priced.reduce((sum, s) => sum + s.width, 0)),
      gross: priced.reduce((sum, s) => sum + f.pricePerMeter * weight * frontedM(s), 0),
      catalogueRate: f.pricePerMeter * weight,
    });
  };
  const walls = Array.isArray(plan.walls) ? plan.walls : [];
  for (const wall of walls) {
    const length = c.walls?.[wall];
    const label = `zid ${String(wall).toUpperCase()}${finite(length) ? ` (${cmFmt.format(length)} cm)` : ""}`;
    for (const zone of ["base", "upper"] as const) {
      const slots = plan.slots.filter((s) => s.run === wall && s.zone === zone);
      addGroup(`${zone === "base" ? "Donji" : "Gornji"} elementi – ${label}`, slots, zone, ZONE_WEIGHT[zone] * hs[zone]);
    }
  }
  addGroup("Visoki elementi", plan.slots.filter((s) => s.zone === "tall"), "tall", ZONE_WEIGHT.tall * hs.tall);
  addGroup("Otok – elementi", plan.slots.filter((s) => s.zone === "island"), "island", ZONE_WEIGHT.island);
  // "do stropa": the top cabinets (nadgradni ormarići) on the wall units and above a split tall column, as price.ts counts them
  const topUpper = hs.top > 0 ? cabinetsOnly.filter((s) => s.zone === "upper" && hasTopBox(s.type)) : [];
  const topTall = hp.tallSplit !== null ? cabinetsOnly.filter((s) => s.zone === "tall") : [];
  if (topUpper.length + topTall.length > 0) {
    const fu = frontOf("upper");
    const u = topUpper.length ? `${topUpper.length} kom iznad gornjih` : "";
    const t = topTall.length ? `${topTall.length} kom iznad visokih` : "";
    const where = `${[u, t].filter(Boolean).join(" i ")} elemenata`;
    const rowH = hp.topRow ? hp.topRow.to - hp.topRow.from : hp.tallTop - (hp.tallSplit ?? hp.tallTop);
    const names = [...new Set([...(topUpper.length ? [fu.name] : []), ...(topTall.length ? [frontOf("tall").name] : [])])];
    groups.push({
      description: "Nadgradni ormarići do stropa",
      details: `${where}, visina ${cmFmt.format(rowH)} cm, s klapnom koja se diže · fronta: ${names.join(", ")}`,
      metres: cmToM([...topUpper, ...topTall].reduce((sum, s) => sum + s.width, 0)),
      gross:
        topUpper.reduce((sum, s) => sum + fu.pricePerMeter * ZONE_WEIGHT.upper * cmToM(s.width) * hs.top + TOP_BOX_HARDWARE, 0) +
        topTall.length * TOP_BOX_HARDWARE,
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
  if (b.cabinets > 0 && !(grossSum > 0)) throw new Error("cabinets without metres");
  for (const g of groups) {
    const qty = round2(g.metres);
    if (!(qty > 0)) continue;
    // the group's share of b.cabinets (the same sum, so the scale is 1 up to rounding)
    const share = (b.cabinets * g.gross) / grossSum;
    lines.push({ description: g.description, details: g.details, qty, unit: "m", grossUnit: rate(share, qty, g.catalogueRate || null) });
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

  /* ---------------- worktop (walls by the metre, island slab as one piece) */
  const wallTopM = plan.runs.reduce((sum, r) => sum + (r.worktop ? cmToM(r.worktop.to - r.worktop.from) : 0), 0);
  let islandSlab = 0;
  if (b.worktop > 0) {
    const wallQty = round2(wallTopM);
    if (plan.island && wallQty > 0) {
      const wallPart = Math.min(b.worktop, top.pricePerMeter * wallTopM);
      islandSlab = b.worktop - wallPart;
      lines.push({
        description: `Radna ploča – ${top.name}`,
        details: `dubina ${cmFmt.format(DIM.worktopDepth)} cm, uz zidove`,
        qty: wallQty,
        unit: "m",
        grossUnit: rate(wallPart, wallQty, top.pricePerMeter),
      });
    } else if (plan.island) {
      islandSlab = b.worktop;
    } else if (wallQty > 0) {
      lines.push({
        description: `Radna ploča – ${top.name}`,
        details: `dubina ${cmFmt.format(DIM.worktopDepth)} cm`,
        qty: wallQty,
        unit: "m",
        grossUnit: rate(b.worktop, wallQty, top.pricePerMeter),
      });
    } else {
      throw new Error("worktop without metres");
    }
  }
  if (islandSlab > 0.5) {
    const len = plan.island?.length;
    lines.push({
      description: `Ploča otoka – ${top.name}`,
      details: `${finite(len) ? `${cmFmt.format(len)} cm, ` : ""}s bočnim stranicama do poda`,
      qty: 1,
      unit: "kompl.",
      grossUnit: islandSlab,
    });
  }

  /* ---------------- backsplash */
  if (b.backsplash > 0.5) {
    const area = round2(backsplashArea(plan));
    if (!(area > 0)) throw new Error("backsplash without area");
    lines.push({
      description: `Zidna obloga – ${top.name}`,
      details: "između radne ploče i gornjih elemenata, u materijalu radne ploče",
      qty: area,
      unit: "m²",
      grossUnit: rate(b.backsplash, area, (top.pricePerMeter / cmToM(DIM.worktopDepth)) * catalog.extras.backsplashShare),
    });
  }

  /* ---------------- handles (per metre of fronts) */
  const frontM = round2(cabinetsOnly.reduce((sum, s) => sum + frontedM(s), 0));
  if (b.handles > 0.5) {
    if (!(frontM > 0)) throw new Error("handles without fronts");
    lines.push({
      description: `Ručke – ${handle.name}`,
      details: "po dužnom metru fronti",
      qty: frontM,
      unit: "m",
      grossUnit: rate(b.handles, frontM, handle.pricePerMeter),
    });
  }

  /* ---------------- finishes: handle colour, sink and tap, plinth (b.finishes) */
  if (b.finishes > 0.5) {
    const f = c.finish ?? {};
    const finishLines: DraftLine[] = [];
    const hc = handleColorDef(f.handleColor ?? defaultHandleColor(c.handles));
    if (handle.coloured && hc && hc.priceAdd > 0 && frontM > 0) {
      finishLines.push({
        description: c.handles === "bez" ? `Profil Gola – ${hc.golaName}` : `Boja ručki – ${hc.name}`,
        details: "doplata po dužnom metru fronti",
        qty: frontM,
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
      lines.push({
        description: "LED rasvjeta – traka",
        details: "ispod gornjih elemenata, u postolju i nišama",
        qty: stripM,
        unit: "m",
        grossUnit: rate(strip, stripM, catalog.extras.ledPerMeter),
      });
    }
    if (fixed > 0.5) {
      lines.push({ description: "LED rasvjeta – napajanje i prekidači", qty: 1, unit: "kompl.", grossUnit: fixed });
    }
  }

  /* ---------------- island extras */
  if (b.island > 0.5) {
    lines.push({
      description: "Otok – stražnja ploča i prepust za sjedenje",
      details: "obloga stražnje strane otoka i prepust radne ploče za barske stolice",
      qty: 1,
      unit: "paušal",
      grossUnit: b.island,
    });
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
