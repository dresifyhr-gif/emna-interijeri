/**
 * Ready-made looks for the studio ("Stil" in the phone's step-by-step flow): a few combinations of front, worktop,
 * opening style and hardware, with a room (wall + floor) and lighting that suit them — data only, plus applyPreset.
 *
 * Applying a preset changes FINISHES ONLY (what the kitchen looks like, never what stands where): the front material
 * (two-tone zones go — a preset is one look), the worktop, how the fronts open (the per-zone opening styles go; an
 * element's own CabinetSpec.opt.open stays), the handle / Gola colour, the sink, tap and appliance finishes, the LED and
 * its colour, the wall behind the worktop, and the room's walls and floor (one finish for every wall). The layout, the
 * walls' lengths, the heights, every element and its options stay exactly as they were.
 *
 * Every id here is a catalog id (lib/studio/catalog.ts) — lib/studio/presets.test.ts checks them.
 */
import { setRoomFinish, type EditResult } from "./edit";
import { sanitizeConfig } from "./plan";
import type { BacksplashSpec, FinishSpec, HandleStyle, KitchenConfig } from "./types";

export interface StylePreset {
  id: string;
  /** Croatian name on the card ("Bijeli lak i crni kamen") */
  name: string;
  /** one short line under the name */
  note: string;
  /** catalog.fronts id */
  front: string;
  /** catalog.tops id */
  top: string;
  handles: HandleStyle;
  /** catalog.finishes.handleColors id (handles that show a colour: Gola, bar, knob, edge grip); absent = the default */
  handleColor?: string;
  /** catalog.finishes.sinks / taps / appliances ids; absent = the default */
  sink?: string;
  tap?: string;
  appliances?: string;
  /** catalog.room.walls id (every wall) */
  wall: string;
  /** catalog.room.floors id */
  floor: string;
  led: boolean;
  /** catalog.finishes.leds id; absent = the default */
  ledColor?: string;
  /** between the worktop and the wall units; absent = the worktop material up to the wall units (the default) */
  backsplash?: BacksplashSpec;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: "bijeli-lak-crni-kamen",
    name: "Bijeli lak i crni kamen",
    note: "Sjajne bijele fronte bez ručki, crna kamena ploča.",
    front: "lak",
    top: "crni",
    handles: "bez",
    handleColor: "crna",
    sink: "granit-crni",
    tap: "crna",
    appliances: "crno-staklo",
    wall: "antracit",
    floor: "beton",
    led: true,
    ledColor: "toplo",
  },
  {
    id: "antracit-kamen",
    name: "Antracit i kamen",
    note: "Tamne mat fronte, sivi granit, topli parket.",
    front: "antracit",
    top: "granit",
    handles: "bez",
    handleColor: "crna",
    sink: "granit-crni",
    tap: "crna",
    appliances: "crno-staklo",
    wall: "greige",
    floor: "parket",
    led: true,
    ledColor: "toplo",
  },
  {
    id: "grafit-mramor",
    name: "Grafit i bijeli mramor",
    note: "Grafitne fronte s letvicama, Calacatta mramor.",
    front: "grafit",
    top: "calacatta",
    handles: "letvica",
    handleColor: "inox",
    sink: "inox",
    tap: "inox",
    appliances: "inox",
    wall: "siva",
    floor: "plocice-velike-svijetle",
    led: true,
    ledColor: "neutralno",
  },
  {
    id: "kasmir-svijetli-kamen",
    name: "Kašmir i svijetli kamen",
    note: "Topla bež boja, bijeli kvarc, ručke u mesingu.",
    front: "kasmir",
    top: "kvarc-bijeli",
    handles: "letvica",
    handleColor: "mesing",
    sink: "granit-bijeli",
    tap: "mesing",
    appliances: "inox",
    wall: "lan",
    floor: "parket-svijetli",
    led: true,
    ledColor: "toplo",
  },
  {
    id: "zelena-crni-mramor",
    name: "Zelena i crni mramor",
    note: "Tamnozelene fronte, Nero Marquina, mesing.",
    front: "zelena-tamna",
    top: "nero",
    handles: "gumb",
    handleColor: "mesing",
    sink: "granit-crni",
    tap: "mesing",
    appliances: "crno-staklo",
    wall: "kreda",
    floor: "riblja-kost",
    led: true,
    ledColor: "toplo",
  },
  {
    id: "bijela-hrast",
    name: "Bijela i hrastova ploča",
    note: "Bijele mat fronte na dodir, ploča od hrasta.",
    front: "bijela",
    top: "hrast",
    handles: "push",
    sink: "granit-bijeli",
    tap: "inox",
    appliances: "inox",
    wall: "bijela",
    floor: "mikrocement-svijetli",
    led: true,
    ledColor: "toplo",
    // an oak worktop does not go up the wall: white tiles behind it
    backsplash: { kind: "plocice", finish: "subway-bijele" },
  },
];

export function presetById(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id);
}

/**
 * The kitchen with the preset's finishes (see the file comment: nothing but finishes changes). Refused only for an
 * unknown preset id.
 */
export function applyPreset(input: KitchenConfig, preset: StylePreset | string): EditResult {
  const cfg = sanitizeConfig(input);
  const p = typeof preset === "string" ? presetById(preset) : preset;
  if (!p) return { cfg, ok: false, warning: "Taj stil više ne postoji.", slotId: null };
  const finish: FinishSpec = { ...(cfg.finish ?? {}) };
  const put = (k: "handleColor" | "sink" | "tap" | "appliances" | "led", v: string | undefined) => {
    if (v) finish[k] = v;
    else delete finish[k];
  };
  put("handleColor", p.handleColor);
  put("sink", p.sink);
  put("tap", p.tap);
  put("appliances", p.appliances);
  put("led", p.ledColor);
  const next: KitchenConfig = {
    ...cfg,
    front: p.front,
    top: p.top,
    handles: p.handles,
    led: p.led,
    finish,
    backsplash: p.backsplash ? { ...p.backsplash } : undefined,
  };
  delete next.zoneFronts;
  delete next.zoneHandles;
  // the room: one finish on every wall (single-wall finishes go), and the floor
  return setRoomFinish(sanitizeConfig(next), { wall: "all", finish: p.wall, floor: p.floor });
}

/** the preset this kitchen wears now (its front, worktop and opening style, one front for the whole kitchen), else null */
export function matchPreset(input: KitchenConfig): string | null {
  const cfg = sanitizeConfig(input);
  if (cfg.zoneFronts && Object.keys(cfg.zoneFronts).length) return null;
  return STYLE_PRESETS.find((p) => p.front === cfg.front && p.top === cfg.top && p.handles === cfg.handles)?.id ?? null;
}
