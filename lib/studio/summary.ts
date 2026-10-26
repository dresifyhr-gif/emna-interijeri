/**
 * Human-readable Croatian summary of a kitchen, one line per item.
 * Goes into the lead e-mail (owner + customer), the admin and the studio "Sažetak".
 * `composition()` is the same element list as structured data (offers, admin).
 */

import {
  FINISH_DEFAULTS,
  backsplashDef,
  defaultHandleColor,
  finishDef,
  frontDef,
  glassFrameDef,
  glassTypeDef,
  handleColorDef,
  handleDef,
  hoodFinishDef,
  moduleDef,
  roomFloorDef,
  roomWallDef,
  topDef,
  worktopThicknessDef,
} from "./catalog";
import {
  backsplashOfCfg,
  defaultAnchor,
  frontFor,
  glassOf,
  hoodKindOf,
  isPeninsula,
  isTallList,
  kitchenRange,
  parseRunEnd,
  planKitchen,
  shelvesOf,
  tallListEnd,
  worktopThickness,
  type KitchenPlan,
  type ListId,
  type PlanSlot,
  type SlotZone,
} from "./plan";
import { backsplashArea } from "./price";
import type { FrontZone, GlassSpec, KitchenConfig, Layout, WallId } from "./types";

const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "ravna kuhinja",
  L: "kuhinja u obliku slova L",
  U: "kuhinja u obliku slova U",
  otok: "ravna kuhinja s otokom",
  poluotok: "kuhinja s poluotokom",
  G: "kuhinja u obliku slova G (L s poluotokom)",
};

const WALL_NAME: Record<WallId, string> = { a: "A", b: "B", c: "C" };
const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };
const ZONE_FRONT_LABEL: Record<FrontZone, string> = {
  base: "Fronte donjih elemenata",
  upper: "Fronte gornjih elemenata",
  tall: "Fronte visokog stupa",
  island: "Fronte otoka",
};

/**
 * Friendly name of a plan slot for people (owner e-mail, studio summary):
 * "a-base-1" → "Zid A · 2. donji slijeva", "tall-0" → "Visoki stup · 1. slijeva",
 * "a-tall-0" → "Zid A · 1. visoki slijeva" (a tall unit standing in the base run),
 * "isl-1" → "Otok · 2. slijeva". Counted left → right, standing in the room facing that wall
 * (the island from the wall-A side). Unknown ids come back as "Element <id>".
 */
export function slotName(id: string, layout?: Layout): string {
  const m = /^([abc])-(base|upper|tall)-(\d+)$/.exec(id);
  if (m) return `Zid ${m[1].toUpperCase()} · ${Number(m[3]) + 1}. ${m[2] === "base" ? "donji" : m[2] === "tall" ? "visoki" : "gornji"} slijeva`;
  const t = /^tall-(\d+)$/.exec(id);
  if (t) return `Visoki stup · ${Number(t[1]) + 1}. slijeva`;
  // a KitchenConfig.tallRuns column: "tall-bl-0" = wall B, left end
  const te = /^tall-([abc])([lr])-(\d+)$/.exec(id);
  if (te) return `Visoki stup uz zid ${te[1].toUpperCase()} (${te[2] === "l" ? "lijevi" : "desni"} kraj) · ${Number(te[3]) + 1}. slijeva`;
  const i = /^isl-(\d+)$/.exec(id);
  if (i) return `${layout && isPeninsula(layout) ? "Poluotok" : "Otok"} · ${Number(i[1]) + 1}. slijeva`;
  return `Element ${id}`;
}

/** "Otok" / "Poluotok" — what the "isl" run is in this layout */
export function islandName(layout: Layout): string {
  return isPeninsula(layout) ? "Poluotok" : "Otok";
}

export interface CompositionItem {
  slotId: string;
  type: string;
  name: string;
  /** cm */
  width: number;
  /** left edge along the run (cm) */
  x: number;
  /** EUR mechanism / fitting add-on from the catalogue (TODO(vlasnik): unconfirmed) */
  priceAdd: number;
  corner: boolean;
  /** empty space, not a cabinet */
  spacer: boolean;
  /** what this element has of its own (elementOptionsText: "satinirano staklo, otvaranje na dodir"); absent = nothing */
  options?: string;
}

export interface CompositionRow {
  /** the editable list (corners are listed in their wall's base / wall-unit row) */
  list: ListId;
  zone: SlotZone;
  /** "Zid A · donji elementi", "Zid B · gornji elementi", "Visoki stup", "Otok" */
  label: string;
  /** the customer edited this run */
  edited: boolean;
  /** front material id of this zone */
  front: string;
  items: CompositionItem[];
}

/** "Visoki stup uz zid B (lijevi kraj)" for a KitchenConfig.tallRuns column */
function tallLabel(list: ListId): string {
  const end = tallListEnd(list);
  if (!end) return "Visoki stup";
  const { wall, side } = parseRunEnd(end);
  return `Visoki stup uz zid ${wall.toUpperCase()} (${side === "left" ? "lijevi" : "desni"} kraj)`;
}

function rowLabel(list: ListId, layout: Layout): string {
  if (isTallList(list)) return tallLabel(list);
  if (list === "isl") return islandName(layout);
  return `Zid ${list[0].toUpperCase()} · ${list.endsWith(":u") ? "gornji" : "donji"} elementi`;
}

/** every cabinet of the kitchen, run by run, left → right — exactly what the 3D view draws and price.ts prices */
export function composition(cfg: KitchenConfig, plan: KitchenPlan = planKitchen(cfg)): CompositionRow[] {
  const c = plan.cfg;
  const rows: CompositionRow[] = [];
  for (const l of plan.lists) {
    const run = isTallList(l.id) || l.id === "isl" ? null : (l.id[0] as WallId);
    const zone: SlotZone = l.zone;
    // a wall's base row: its corner units, its cabinets and the tall units standing in it (CabinetSpec.tall)
    const slots = plan.slots
      .filter((s) =>
        isTallList(l.id) ? s.zone === "tall" && s.list?.id === l.id : l.id === "isl" ? s.zone === "island" : s.run === run && (s.zone === zone || (s.list?.id === l.id && s.zone === "tall")),
      )
      .sort((p, q) => p.x - q.x);
    if (!slots.length) continue;
    const edited = l.explicit || slots.some((s) => s.cornerId && c.corners?.[s.cornerId]);
    rows.push({
      list: l.id,
      zone,
      label: rowLabel(l.id, c.layout),
      edited,
      front: frontFor(c, zone),
      items: slots.map((s) => {
        const def = moduleDef(s.zone, s.type);
        // a door or a vitrine in a blind corner is still a corner unit
        const name = def ? (s.corner && !def.corner ? `Kutni element, ${def.name.toLowerCase()}` : def.name) : s.type;
        const options = elementOptionsText(c, s);
        return {
          slotId: s.id,
          type: s.type,
          name,
          width: Math.round(s.width),
          x: Math.round(s.x * 10) / 10,
          priceAdd: def?.priceAdd ?? 0,
          corner: Boolean(s.corner),
          spacer: Boolean(def?.spacer),
          ...(options ? { options } : {}),
        };
      }),
    });
  }
  return rows;
}

/** "satinirano staklo, tanki aluminijski, crni okvir, bez LED-a" — the glass of a glass-door element in words */
export function glassText(g: Required<GlassSpec>): string {
  const parts = [(glassTypeDef(g.type)?.name ?? g.type).toLowerCase()];
  if (g.frame !== "fronta") parts.push(`okvir ${(glassFrameDef(g.frame)?.name ?? g.frame).toLowerCase()}`);
  if (!g.led) parts.push("bez LED-a");
  if (!g.shelves) parts.push("bez staklenih polica");
  return parts.join(", ");
}

/**
 * What an element has of its own beyond its type (summary, admin quote), or null: its glass when the kitchen / the element
 * sets one (KitchenConfig.glass, opt.glass), its own opening style, top-box depth, hob hood, shelf rows / LED, and an end
 * unit at the end of its run. Every older link: null for every element.
 */
export function elementOptionsText(cfg: KitchenConfig, s: PlanSlot): string | null {
  const def = moduleDef(s.zone, s.type);
  if (!def || def.spacer) return null;
  const o = s.opt;
  const parts: string[] = [];
  if (def.glass && (cfg.glass || o?.glass)) parts.push(glassText(glassOf(cfg, o)));
  if (o?.open && o.open !== cfg.handles) parts.push((handleDef(o.open)?.name ?? o.open).toLowerCase());
  if (o?.depth !== undefined) parts.push(`nadgradni ormarić dubine ${o.depth} cm`);
  if (def.feature === "hob" && o?.hood) parts.push(HOOD_WORDS[hoodKindOf(cfg, o)]);
  if (def.rows) {
    const sh = shelvesOf(o);
    parts.push(`${sh.rows} ${sh.rows === 1 ? "polica" : "police"}${sh.led ? " s LED-om" : ""}`);
  } else if (def.lit && o?.led === false) parts.push("bez LED-a");
  if (s.end) parts.push(`završetak ${s.end.side === "left" ? "lijevog" : "desnog"} kraja`);
  return parts.length ? parts.join(", ") : null;
}

const HOOD_WORDS = {
  ugradbena: "napa ugrađena u zidni element",
  dimnjak: "zidna napa s dimnjakom",
  kosa: "kosa staklena napa",
  ploca: "napa u ploči (downdraft)",
} as const;

/** "1 barska stolica", "3 barske stolice", "5 barskih stolica" / "2 stolice" */
function seatsWord(n: number, bar: boolean): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const few = m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14);
  const one = m10 === 1 && m100 !== 11;
  if (bar) return `${n} ${one ? "barska stolica" : few ? "barske stolice" : "barskih stolica"}`;
  return `${n} ${one ? "stolica" : few ? "stolice" : "stolica"}`;
}

/**
 * The island / peninsula in words (summary, admin): length and place, body, ends, what it holds, seating, bar / table
 * and the ceiling hood. The island of an older link keeps its one line exactly as before (unless the customer put a hob
 * on it: it then has the ceiling hood, and the lines say so).
 */
export function islandSummary(plan: KitchenPlan): string[] {
  const I = plan.island;
  if (!I) return [];
  const c = plan.cfg;
  if (!c.islandSpec && I.kind === "otok" && !I.hood) return [`Otok: ${c.island} cm, s pločom koja se spušta do poda i mjestom za sjedenje`];
  const name = islandName(c.layout);
  const on = I.kind === "poluotok" ? "poluotoku" : "otoku";
  const r = Math.round;
  const lines: string[] = [];
  const where = I.side ? `, uz ${I.side === "left" ? "lijevi" : "desni"} kraj zida A` : "";
  const body = I.backRow ? `, dubok ${I.depth} cm (straga ormarići ${I.backRow.depth} cm s otvaranjem na dodir)` : "";
  const ends = I.waterfalls.length
    ? I.waterfalls.length > 1
      ? "ploča se s obje strane spušta do poda"
      : "ploča se na slobodnom kraju spušta do poda"
    : "bočne ploče u boji fronte";
  lines.push(`${name}: ${c.island} cm${where}${body}, ${ends}`);
  const isF = (t: string, f: "sink" | "hob" | "dishwasher") => moduleDef("base", t)?.feature === f;
  const isl = plan.slots.filter((s) => s.zone === "island");
  const holds = [isl.some((s) => isF(s.type, "hob")) ? "ploča za kuhanje" : null, isl.some((s) => isF(s.type, "sink")) ? "sudoper" : null].filter(Boolean);
  if (holds.length) lines.push(`Na ${on}: ${holds.join(" i ")}${isl.some((s) => isF(s.type, "dishwasher")) ? ", perilica posuđa" : ""}`);
  const b = I.bar;
  if (b) {
    const top = topDef(b.top)?.name ?? b.top;
    const what = b.kind === "raised" ? "Šank: povišeni," : "Spušteni stol:";
    lines.push(`${what} ${r(b.height)} cm od poda, dubina ${r(b.depth)} cm, dužina ${r(b.to - b.from)} cm, ploča: ${top}`);
  }
  if (I.seats.length) {
    const at = b
      ? b.kind === "raised"
        ? "uz šank"
        : "uz stol"
      : I.seatSide === "back"
        ? `straga, prepust ${I.overhang} cm`
        : `na ${I.seatSide === "left" ? "lijevom" : "desnom"} kraju, prepust ${I.overhang} cm`;
    lines.push(`Sjedenje: ${seatsWord(I.seats.length, I.seats[0].kind === "stool")} ${at} (stolice nisu uključene u cijenu)`);
  } else if (!I.seatSide) lines.push("Sjedenje: bez prepusta za sjedenje");
  if (I.hood) {
    const h = I.hood;
    const finish = h.finish ? `, ${(hoodFinishDef(h.finish)?.name ?? h.finish).toLowerCase()}` : "";
    lines.push(
      h.style === "kaseta"
        ? `Napa: stropna kaseta u ravnini sa stropom, ${r(h.width)} × ${r(h.depth)} cm${finish}, iznad ploče na ${on} — napa nije uračunata u cijenu`
        : `Napa: otočna, stropna, ${r(h.width)} × ${r(h.depth)} cm${finish}, donji rub ${r(h.bottom)} cm od poda (${r(h.above)} cm iznad radne ploče), iznad ploče na ${on} — napa nije uračunata u cijenu`,
    );
  } else if ((c.islandSpec?.hood === false || isl.some((s) => isF(s.type, "hob") && hoodKindOf(c, s.opt) === "ploca")) && isl.some((s) => isF(s.type, "hob"))) {
    lines.push(`Napa: bez nape iznad ${on === "otoku" ? "otoka" : "poluotoka"} (ploča s ugrađenim odsisom)`);
  }
  return lines;
}

/**
 * ", kuhinja 300 cm od kuta sa zidom A" — where the kitchen stands on a room wall when it does not take the whole wall
 * (KitchenConfig.extents); "" for a kitchen along the whole wall (every older link)
 */
export function kitchenOnWall(plan: KitchenPlan, w: WallId): string {
  const c = plan.cfg;
  if (!c.extents?.[w]) return "";
  const k = kitchenRange(c, w);
  const L = c.walls[w];
  const len = Math.round(k.to - k.from);
  const corner: Record<WallId, { left: string | null; right: string | null }> = { a: { left: c.layout === "ravna" || c.layout === "otok" || c.layout === "poluotok" ? null : "B", right: c.layout === "U" ? "C" : null }, b: { left: null, right: "A" }, c: { left: "A", right: null } };
  const anchor = c.extents[w]?.anchor ?? defaultAnchor(w);
  const off = Math.round(anchor === "left" ? k.from : L - k.to);
  const other = corner[w][anchor];
  const where = other
    ? off === 0
      ? `od kuta sa zidom ${other}`
      : `${off} cm od kuta sa zidom ${other}`
    : off === 0
      ? `od ${anchor === "left" ? "lijevog" : "desnog"} kraja zida`
      : `${off} cm od ${anchor === "left" ? "lijevog" : "desnog"} kraja zida`;
  return `, kuhinja ${len} cm (${where})`;
}

export function summarize(cfg: KitchenConfig): string[] {
  const plan = planKitchen(cfg);
  const c = plan.cfg;
  const lines: string[] = [];

  lines.push(`Oblik: ${LAYOUT_NAME[c.layout]}`);
  for (const w of plan.walls) {
    lines.push(`Zid ${WALL_NAME[w]} (${WALL_HINT[w]}): ${c.walls[w]} cm${kitchenOnWall(plan, w)}`);
  }
  lines.push(`Visina stropa: ${c.ceiling} cm`);
  // heights other than the standard ones (KitchenConfig.heights), as the plan fitted them under the ceiling (a top-row
  // depth alone is not a height: it has its own line below)
  if (c.heights && (c.heights.mode !== "standard" || c.heights.worktop !== undefined || worktopThickness(c) !== 4)) {
    const H = plan.heights;
    const r = Math.round;
    const parts = [`radna ploča ${r(H.worktop)} cm`, `gornji elementi ${r(H.upperTop - H.upperBottom)} cm (${r(H.upperBottom)}–${r(H.upperTop)} cm od poda)`];
    if (H.topRow) parts.push(`nadgradni ormarići ${r(H.topRow.to - H.topRow.from)} cm (do ${r(H.topRow.to)} cm${c.heights?.topDepth !== undefined ? `, dubina ${c.heights.topDepth} cm` : ""})`);
    if (plan.slots.some((s) => s.zone === "tall")) parts.push(`visoki stup do ${r(H.tallTop)} cm`);
    if (H.cornice) parts.push(`lajsna do stropa ${r(H.cornice.to - H.cornice.from)} cm`);
    const mode = H.mode === "do-stropa" ? "do stropa" : H.mode === "custom" ? "po mjeri" : "standardne";
    lines.push(`Visine: ${mode} — ${parts.join(", ")}`);
  }

  if (plan.window) {
    const w = plan.window;
    lines.push(
      `Prozor: zid ${WALL_NAME[w.wall]}, ${Math.round(w.offset)} cm od lijevog kraja zida, širina ${Math.round(w.width)} cm, parapet ${Math.round(w.sill)} cm`,
    );
  } else {
    lines.push("Prozor: nije označen");
  }

  // fronts: the main one, then every zone that wears another one (only zones the kitchen has)
  lines.push(`Fronta: ${frontDef(c.front)?.name ?? c.front}`);
  const zonesPresent = new Set(plan.slots.map((s) => s.zone));
  for (const z of ["base", "upper", "tall", "island"] as FrontZone[]) {
    const f = c.zoneFronts?.[z];
    const label = z === "island" && isPeninsula(c.layout) ? "Fronte poluotoka" : ZONE_FRONT_LABEL[z];
    if (f && zonesPresent.has(z)) lines.push(`${label}: ${frontDef(f)?.name ?? f}`);
  }

  const handle = handleDef(c.handles);
  const hc = handleColorDef(c.finish?.handleColor ?? defaultHandleColor(c.handles));
  const colour = handle?.coloured && hc ? `, ${(c.handles === "bez" ? hc.golaName : hc.name).toLowerCase()}` : "";
  // elements that open differently from the rest (CabinetSpec.opt.open)
  const own = new Map<string, number>();
  for (const sl of plan.slots) {
    const o = sl.opt?.open;
    if (o && o !== c.handles) own.set(o, (own.get(o) ?? 0) + 1);
  }
  const ownText = [...own].map(([id, n]) => `${(handleDef(id)?.name ?? id).toLowerCase()}: ${n} ${n === 1 ? "element" : n < 5 ? "elementa" : "elemenata"}`).join("; ");
  lines.push(`Ručke: ${handle?.name ?? c.handles}${colour}${ownText ? ` (osim: ${ownText})` : ""}`);

  const topName = topDef(c.top)?.name ?? c.top;
  const thick = worktopThickness(c);
  lines.push(`Radna ploča: ${topName}${c.worktop ? `, debljina ${worktopThicknessDef(thick)?.name ?? `${thick} cm`}` : ""}`);
  // the engine draws the backsplash (worktop material, glass or tiles) and price.ts prices it, so the owner sees it too
  const splash = backsplashArea(plan);
  const bs = backsplashOfCfg(c);
  const m2 = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(splash);
  if (bs.kind === "bez") lines.push("Zidna obloga: bez obloge između radne ploče i gornjih elemenata");
  else if (splash > 0.05) {
    const what = bs.kind === "staklo" || bs.kind === "plocice" ? (backsplashDef(bs.finish ?? undefined)?.name ?? bs.finish ?? bs.kind) : topName;
    const where = bs.kind === "pola" ? "do pola visine između radne ploče i gornjih elemenata" : "između radne ploče i gornjih elemenata";
    lines.push(`Zidna obloga: ${what}, oko ${m2} m² ${where}`);
  }
  // hanging rails with hooks (KitchenConfig.rails)
  for (const r of plan.runs) {
    if (r.rail) lines.push(`Reling s kukama: zid ${WALL_NAME[r.wall]}, ${Math.round(r.rail.to - r.rail.from)} cm`);
  }
  // the hood above a wall hob: only when it is not the hidden one in a wall unit (every older link)
  for (const r of plan.runs) {
    for (const h of r.hoods ?? []) {
      const finish = (hoodFinishDef(h.finish)?.name ?? h.finish).toLowerCase();
      const kind = h.kind === "dimnjak" ? "zidna s dimnjakom do stropa" : "kosa staklena";
      lines.push(`Napa: ${kind}, ${Math.round(h.width)} cm, ${finish}, iznad ploče na zidu ${WALL_NAME[r.wall]} (iznad nje nema zidnih elemenata) — napa nije uračunata u cijenu`);
    }
  }
  const downdraft = plan.slots.filter((sl) => sl.zone === "base" && moduleDef("base", sl.type)?.feature === "hob" && hoodKindOf(c, sl.opt) === "ploca");
  if (downdraft.length) lines.push(`Napa: u ploči za kuhanje (ploča s ugrađenim odsisom, bez nape iznad)${downdraft.length > 1 ? ` — ${downdraft.length} ploče` : ""}`);
  // glass-door elements: the kitchen's glass (KitchenConfig.glass) when it is not the plain one of every older link
  const glassy = plan.slots.filter((sl) => moduleDef(sl.zone, sl.type)?.glass);
  if (c.glass && glassy.length) lines.push(`Staklo vitrina: ${glassText(glassOf(c))}`);


  // hardware the kitchen actually has
  const has = (f: (t: string, z: SlotZone) => boolean) => plan.slots.some((s) => f(s.type, s.zone));
  const def = (t: string, z: SlotZone) => moduleDef(z, t);
  if (has((t, z) => def(t, z)?.feature === "sink")) {
    const sink = finishDef("sinks", c.finish?.sink ?? FINISH_DEFAULTS.sink)?.name ?? "";
    const tap = finishDef("taps", c.finish?.tap ?? FINISH_DEFAULTS.tap)?.name ?? "";
    lines.push(`Sudoper: ${sink.toLowerCase()}, slavina: ${tap.toLowerCase()}`);
  }
  const ovens = ["ploca-pecnica", "pecnica-donja", "pecnica", "pecnica-mikro", "mikrovalna"];
  if (has((t) => ovens.includes(t))) {
    lines.push(`Fronte aparata (pećnica, mikrovalna): ${(finishDef("appliances", c.finish?.appliances ?? FINISH_DEFAULTS.appliances)?.name ?? "").toLowerCase()}`);
  }
  if (c.finish?.plinth) lines.push(`Postolje: ${(finishDef("plinths", c.finish.plinth)?.name ?? c.finish.plinth).toLowerCase()}`);

  const tallNames = (list: ListId) =>
    plan.slots.filter((s) => s.zone === "tall" && s.list?.id === list).map((s) => `${moduleDef("tall", s.type)?.name.toLowerCase() ?? s.type} ${Math.round(s.width)} cm`);
  const tall = tallNames("tall");
  if (tall.length) {
    lines.push(`Visoki stup: da (${tall.join(", ")})`);
  } else {
    lines.push(c.tall ? "Visoki stup: ne stane uz ove mjere" : "Visoki stup: ne");
  }
  // more tall columns at other run ends (KitchenConfig.tallRuns)
  for (const l of plan.lists) {
    if (!tallListEnd(l.id)) continue;
    const names = tallNames(l.id);
    if (names.length) lines.push(`${tallLabel(l.id)}: ${names.join(", ")}`);
  }
  // tall units standing in a wall's base run (between its cabinets)
  for (const w of plan.walls) {
    const names = tallNames(w);
    if (names.length) lines.push(`Visoki elementi u nizu uz zid ${WALL_NAME[w]}: ${names.join(", ")}`);
  }

  const led = finishDef("leds", c.finish?.led ?? FINISH_DEFAULTS.led)?.name.toLowerCase();
  lines.push(`LED rasvjeta: ${c.led ? `da (${led}, ispod gornjih elemenata, u postolju i nišama)` : "ne"}`);
  lines.push(...islandSummary(plan));

  // every run, left → right (edited ones marked) — the owner quotes from this
  for (const row of composition(c, plan)) {
    if (isTallList(row.list)) continue;
    const items = row.items.map((it) => `${it.spacer ? it.name.toLowerCase() : it.name} ${it.width}${it.options ? ` (${it.options})` : ""}`).join(" · ");
    lines.push(`${row.label}${row.edited ? " (uređeno)" : ""}: ${items}`);
  }

  if (c.room?.wall || c.room?.floor || c.room?.walls) {
    const parts = [
      c.room.wall ? `zid ${roomWallDef(c.room.wall)?.name.toLowerCase()}` : null,
      ...plan.walls.map((w) => (c.room?.walls?.[w] ? `zid ${WALL_NAME[w]} ${roomWallDef(c.room.walls[w])?.name.toLowerCase()}` : null)),
      c.room.floor ? `pod ${roomFloorDef(c.room.floor)?.name.toLowerCase()}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Prostor u prikazu (samo za dojam): ${parts.join(", ")}`);
  }

  for (const w of plan.warnings) lines.push(`Napomena: ${w}`);
  return lines;
}
