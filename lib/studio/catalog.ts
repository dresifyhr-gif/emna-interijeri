/**
 * Studio catalogue — fronts, worktops, handles, finishes, room looks and module types (mechanisms).
 *
 * This file is DATA, not code: the engine, the price estimate, the summary, the share link and the
 * planner all read it. Adding a front or a module type here is enough for it to appear everywhere
 * (the UI lists `catalog.*`); a new module type also needs a builder in lib/studio/engine/modules.ts
 * (unknown types fall back to a plain door unit there).
 *
 * TODO(vlasnik): CIJENE NISU POTVRĐENE. Svaka brojka u ovoj datoteci (cijena po metru fronte, radne ploče
 * i ručki, doplata za svaki tip elementa, za boje okova, sudoper, slavinu i postolje, LED, montaža, otok,
 * udio zidne obloge i raspon ±) naša je procjena za kuhinje po mjeri u Hrvatskoj, ne cjenik tvrtke: EUR,
 * s PDV-om, bez kućanskih aparata (hladnjak, pećnica, mikrovalna, perilice, ploča za kuhanje i napa nisu
 * uračunati, uračunata je samo njihova ugradnja). Vlasnik mora potvrditi ili ispraviti svaku brojku prije
 * objave i tek onda postaviti PRICES_CONFIRMED na true. Dok je false, sučelje i e-mailovi moraju jasno
 * reći da cijena nije potvrđena (ili je ne prikazivati).
 *
 * Must stay free of three.js and DOM access (it is also imported server-side).
 */

import type { HandleStyle } from "./types";

/**
 * false until the owner has confirmed every rate in this file (see the TODO above).
 * The studio UI, the lead e-mails and anything else that shows a price read this flag.
 */
export const PRICES_CONFIRMED: boolean = false;

// ================================================================ materials

/** How the engine should render a material (interpreted by lib/studio/engine/materials.ts). */
export interface MaterialRender {
  /** "solid" = flat colour, the others get a procedural texture ("brushed" = fine metal streaks) */
  kind: "solid" | "wood" | "marble" | "stone" | "concrete" | "brushed";
  /** albedo (sRGB hex) */
  color: string;
  roughness: number;
  metalness?: number;
  /** > 0 switches to a physical material with a clear coat (lacquer, polished stone) */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** procedural texture tones: [base, dark, light] */
  tones?: [string, string, string];
  /** texture tile size in metres (how big one repeat of the pattern is) */
  tile?: number;
  /** texture detail: wood grain lines, stone specks, marble veins (multiplier, default 1) */
  density?: number;
  /** marble: "bold" = a few wide, high-contrast veins (Calacatta), default fine veining */
  veins?: "fine" | "bold";
  /** carcass (cabinet body) colour that goes with this front */
  carcass?: string;
}

/** front families, in the order the studio lists them */
export type FrontFamily = "mat" | "sjaj" | "drvo" | "kamen" | "metal";
/** worktop families */
export type TopFamily = "mramor" | "kamen" | "kvarc" | "beton" | "kompakt" | "drvo" | "metal";

export interface MaterialDef {
  id: string;
  name: string;
  /** fronts: FrontFamily, worktops: TopFamily */
  family: string;
  /** CSS `background` value for a swatch chip */
  swatch: string;
  /** EUR per running metre (see price.ts for how each zone uses it) */
  pricePerMeter: number;
  render: MaterialRender;
  /** position on the homepage material strip (1 = first); absent = studio only */
  featured?: number;
}

export interface FamilyDef {
  id: string;
  name: string;
}

// ---------------------------------------------------------------- swatch helpers (CSS strings only)

const woodSwatch = (base: string, dark: string, light: string, deg = 90) =>
  `repeating-linear-gradient(${deg}deg,${base} 0 2px,${dark} 2px 3px,${light} 3px 6px)`;
const marbleSwatch = (base: string, vein: string, soft: string) =>
  `linear-gradient(135deg,${base} 0 38%,${vein} 40%,${base} 43% 68%,${soft} 70%,${base} 73%)`;
const speckSwatch = (base: string, dot: string) => `radial-gradient(circle,${dot} 0 1px,transparent 1.5px) 0 0/5px 5px,${base}`;
const cloudSwatch = (a: string, b: string) => `radial-gradient(circle at 30% 40%,${a},${b} 70%)`;
const metalSwatch = (a: string, b: string, c: string) => `linear-gradient(135deg,${a},${b} 48%,${c})`;
const glossSwatch = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`;

const DARK_CARCASS = "#2f2d2a";
const LIGHT_CARCASS = "#dcd7ce";

/** a matt lacquer front */
function mat(id: string, name: string, color: string, light: boolean, price = 950, extra: Partial<MaterialDef> = {}): MaterialDef {
  return {
    id,
    name,
    family: "mat",
    swatch: color,
    pricePerMeter: price,
    render: { kind: "solid", color, roughness: 0.66, carcass: light ? LIGHT_CARCASS : DARK_CARCASS },
    ...extra,
  };
}

/** a high-gloss lacquer front */
function gloss(id: string, name: string, color: string, hi: string, light: boolean, price = 1180): MaterialDef {
  return {
    id,
    name,
    family: "sjaj",
    swatch: glossSwatch(hi, color),
    pricePerMeter: price,
    render: { kind: "solid", color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, carcass: light ? LIGHT_CARCASS : DARK_CARCASS },
  };
}

/** a wood veneer front */
function wood(id: string, name: string, tones: [string, string, string], light: boolean, price: number, roughness = 0.56, density = 1): MaterialDef {
  return {
    id,
    name,
    family: "drvo",
    swatch: woodSwatch(tones[0], tones[1], tones[2]),
    pricePerMeter: price,
    render: { kind: "wood", color: tones[0], roughness, tones, tile: 0.8, density, carcass: light ? LIGHT_CARCASS : DARK_CARCASS },
  };
}

/** a metallic lacquer front (fine brushed streaks, real metalness) */
function metal(id: string, name: string, tones: [string, string, string], price = 1320): MaterialDef {
  return {
    id,
    name,
    family: "metal",
    swatch: metalSwatch(tones[2], tones[0], tones[1]),
    pricePerMeter: price,
    render: { kind: "brushed", color: tones[0], roughness: 0.36, metalness: 0.72, tones, tile: 0.6, carcass: DARK_CARCASS },
  };
}

// ================================================================ hardware, finishes, room

export interface HandleDef {
  id: HandleStyle;
  name: string;
  /** one-line explanation for the studio */
  note: string;
  /** EUR per running metre of fronts */
  pricePerMeter: number;
  /** the style shows a colour (catalog.finishes.handleColors) */
  coloured: boolean;
}

export interface FinishOption {
  id: string;
  name: string;
  /** CSS background for a small chip */
  swatch: string;
  /** EUR — per running metre for handle colours and plinths, per piece for sink and tap */
  priceAdd: number;
}

/** what the engine needs to draw a hardware finish */
export interface FinishRender {
  color: string;
  roughness: number;
  metalness: number;
}

export interface FinishDef extends FinishOption {
  render: FinishRender;
}

export interface HandleColorDef extends FinishDef {
  /** name when it is the colour of the Gola profile ("Zlatni profil" rather than "Mesing") */
  golaName: string;
}

export interface LedDef extends FinishOption {
  /** strip colour (sRGB hex) */
  color: string;
}

export interface RoomWallDef {
  id: string;
  name: string;
  swatch: string;
  color: string;
  roughness: number;
}

export interface RoomFloorDef {
  id: string;
  name: string;
  swatch: string;
  render: {
    kind: "solid" | "planks" | "concrete" | "tiles";
    color: string;
    roughness: number;
    /** [base, dark, light] */
    tones?: [string, string, string];
    /** one texture repeat in metres */
    tile?: number;
    /** tiles: grout colour */
    grout?: string;
  };
}

// ================================================================ module types

export type ModuleZone = "base" | "upper" | "tall";

/** what a module type is for — the studio groups the element picker by this */
export type ModuleGroup = "ladice" | "vrata" | "voda" | "kuhanje" | "spremanje" | "otvoreno" | "aparati" | "kut" | "prazno";

export interface ModuleTypeDef {
  /** unique within its zone ("vrata" exists both as a base and as an upper type) */
  id: string;
  name: string;
  zone: ModuleZone;
  description: string;
  /** EUR added on top of the per-metre price (mechanism, sink, integration …) — TODO(vlasnik) */
  priceAdd: number;
  /** allowed carcass widths in cm (inclusive), = min / max of `widths` */
  minWidth: number;
  maxWidth: number;
  /** the exact widths this type comes in (cm). Spacers take any width from minWidth to maxWidth. */
  widths: number[];
  /** share-link code: lowercase letters, unique within the zone */
  code: string;
  group: ModuleGroup;
  /** true = only for corner slots; corner slots also accept `cornerOk` types */
  corner?: boolean;
  /** may be used in a corner slot (the visible door part of a blind corner) */
  cornerOk?: boolean;
  /** may be used on the island (base types only) */
  island?: boolean;
  /** the kitchen's essentials: warnings when they are missing, the hood follows the hob */
  feature?: "sink" | "hob" | "dishwasher";
  /** a cooker hood: in an explicit wall-unit list it stays anchored above the hob */
  hood?: boolean;
  /** empty space (no cabinet), any width — shown as a clickable outline in the studio */
  spacer?: boolean;
  /** share of the zone's per-metre front price this type uses (1 = carcass + front; open units less; spacers 0) */
  frontShare?: number;
  /** false = nothing moves (open shelves, empty space) — no mechanism demo */
  demo?: boolean;
  /** the type that takes over at a width this one does not come in (base doors: 1 door ≤ 60, 2 doors above) */
  sibling?: string;
}

export interface CatalogExtras {
  /** LED strip under wall units, plinth and inside niches — per metre of upper run */
  ledPerMeter: number;
  /** LED drivers, switches */
  ledFixed: number;
  /** delivery + installation per running metre of cabinets */
  installPerMeter: number;
  /** island: back panel, seating overhang and both waterfall sides */
  islandFixed: number;
  /**
   * stone backsplash between worktop and wall units, in the worktop material: share of the
   * worktop's price per m² (1 = same price per m² as the worktop)
   */
  backsplashShare: number;
  /** relative +/- of the estimate range */
  spread: number;
}

export interface Catalog {
  fronts: MaterialDef[];
  frontFamilies: FamilyDef[];
  tops: MaterialDef[];
  topFamilies: FamilyDef[];
  handles: HandleDef[];
  finishes: {
    handleColors: HandleColorDef[];
    sinks: FinishDef[];
    taps: FinishDef[];
    appliances: FinishDef[];
    /** "fronta" = in the colour of the base fronts */
    plinths: FinishDef[];
    leds: LedDef[];
  };
  room: { walls: RoomWallDef[]; floors: RoomFloorDef[] };
  modules: ModuleTypeDef[];
  moduleGroups: { id: ModuleGroup; name: string }[];
  extras: CatalogExtras;
}

/** fill min/max from the widths */
function mod(d: Omit<ModuleTypeDef, "minWidth" | "maxWidth"> & { minWidth?: number; maxWidth?: number }): ModuleTypeDef {
  return { ...d, minWidth: d.minWidth ?? Math.min(...d.widths), maxWidth: d.maxWidth ?? Math.max(...d.widths) };
}

const W_ALL = [30, 40, 45, 50, 60, 80, 90];
const W_NARROW = [30, 40, 45, 50, 60];
const W_WIDE = [60, 80, 90];
const W_SPACER = [30, 40, 45, 50, 60, 80, 90];

// ================================================================ the catalogue

export const catalog: Catalog = {
  frontFamilies: [
    { id: "mat", name: "Mat lak" },
    { id: "sjaj", name: "Sjajni lak" },
    { id: "drvo", name: "Drvo i furnir" },
    { id: "kamen", name: "Kamen i beton" },
    { id: "metal", name: "Metalik" },
  ],

  fronts: [
    // ---- matt lacquer (the first ones keep their v1 ids and look: old links and the homepage use them)
    mat("antracit", "Antracit mat", "#2a2b2e", false, 950, {
      swatch: "#2c2d30",
      featured: 1,
      render: { kind: "solid", color: "#2a2b2e", roughness: 0.62, carcass: DARK_CARCASS },
    }),
    mat("bijela", "Bijela mat", "#e7e4dd", true, 900, {
      swatch: "#ebe8e2",
      featured: 2,
      render: { kind: "solid", color: "#e7e4dd", roughness: 0.7, carcass: LIGHT_CARCASS },
    }),
    mat("krem", "Krem mat", "#e4dac7", true, 920, { swatch: "#e8dfce" }),
    mat("kasmir", "Kašmir mat", "#b3a795", true, 950, {
      swatch: "#b6aa99",
      featured: 4,
      render: { kind: "solid", color: "#b3a795", roughness: 0.66, carcass: LIGHT_CARCASS },
    }),
    mat("pijesak", "Pijesak mat", "#c6b394", true, 950, { swatch: "#cab89b" }),
    mat("siva-svijetla", "Svijetlosiva mat", "#bab9b4", true, 930, { swatch: "#bfbeb9" }),
    mat("siva-tamna", "Tamnosiva mat", "#57585a", false, 950, { swatch: "#5b5c5f" }),
    mat("crna", "Crna mat", "#141415", false, 980, {
      swatch: "#18181a",
      render: { kind: "solid", color: "#141415", roughness: 0.6, carcass: DARK_CARCASS },
    }),
    mat("maslina", "Maslina mat", "#485443", false, 980, {
      swatch: "#4c5848",
      featured: 5,
      render: { kind: "solid", color: "#485443", roughness: 0.6, carcass: DARK_CARCASS },
    }),
    mat("kadulja", "Kadulja mat", "#8b9682", true, 980, { swatch: "#909a87" }),
    mat("zelena-tamna", "Tamnozelena mat", "#25372d", false, 990, { swatch: "#293b31" }),
    mat("petrolej", "Petrolej mat", "#26464a", false, 990, { swatch: "#2a4a4e" }),
    mat("plava-nocna", "Noćno plava mat", "#1e2838", false, 990, { swatch: "#222c3d" }),
    mat("terakota", "Terakota mat", "#9c5639", false, 990, { swatch: "#a05a3d" }),
    mat("bordo", "Bordo mat", "#57232a", false, 990, { swatch: "#5b262d" }),

    // ---- high-gloss lacquer
    {
      id: "lak",
      name: "Bijeli sjajni lak",
      family: "sjaj",
      swatch: "linear-gradient(135deg,#ffffff,#dcd8d0)",
      pricePerMeter: 1150,
      featured: 3,
      render: { kind: "solid", color: "#ebe8e1", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, carcass: LIGHT_CARCASS },
    },
    gloss("krem-sjaj", "Krem sjajni lak", "#e2d6c1", "#f6efe2", true),
    gloss("siva-sjaj", "Sivi sjajni lak", "#8c8d8e", "#c9cacb", true),
    gloss("antracit-sjaj", "Antracit sjajni lak", "#2b2c2f", "#5d5f63", false),
    gloss("crna-sjaj", "Crni sjajni lak", "#0f0f10", "#3a3a3d", false, 1220),

    // ---- wood veneer
    {
      id: "hrast",
      name: "Hrast prirodni",
      family: "drvo",
      swatch: woodSwatch("#b08a5e", "#8e6b45", "#c39d70"),
      pricePerMeter: 1350,
      featured: 6,
      render: { kind: "wood", color: "#b08a5e", roughness: 0.58, tones: ["#b08a5e", "#6e4f31", "#d3b088"], tile: 0.8, carcass: LIGHT_CARCASS },
    },
    wood("hrast-bijeljeni", "Hrast bijeljeni", ["#d6c7ae", "#a8967a", "#ece2d1"], true, 1380, 0.6, 0.85),
    wood("hrast-dimljeni", "Hrast dimljeni", ["#6b5644", "#3b2e23", "#8d775f"], false, 1420, 0.55),
    wood("hrast-crni", "Hrast crno bajcan", ["#2a2522", "#141210", "#4a423b"], false, 1450, 0.58, 1.1),
    {
      id: "orah",
      name: "Orah",
      family: "drvo",
      swatch: woodSwatch("#5c412c", "#3a281a", "#7a5a3e"),
      pricePerMeter: 1450,
      featured: 7,
      render: { kind: "wood", color: "#5c412c", roughness: 0.55, tones: ["#5c412c", "#2e1f14", "#8a6646"], tile: 0.8, carcass: DARK_CARCASS },
    },
    wood("jasen", "Jasen", ["#cdb894", "#9c8562", "#e2d3b6"], true, 1330, 0.58, 1.35),
    wood("tik", "Tik", ["#8a5a33", "#5a3820", "#b07c4c"], false, 1520, 0.52, 1.15),

    // ---- stone / concrete décor
    {
      id: "beton-svijetli",
      name: "Dekor svijetli beton",
      family: "kamen",
      swatch: cloudSwatch("#bab7b0", "#a19e97"),
      pricePerMeter: 1120,
      render: { kind: "concrete", color: "#aeaba4", roughness: 0.8, tones: ["#aeaba4", "#96938c", "#c6c3bc"], tile: 1.4, carcass: LIGHT_CARCASS },
    },
    {
      id: "beton-tamni",
      name: "Dekor tamni beton",
      family: "kamen",
      swatch: cloudSwatch("#6a6865", "#55534f"),
      pricePerMeter: 1120,
      render: { kind: "concrete", color: "#5f5d59", roughness: 0.78, tones: ["#5f5d59", "#4a4845", "#77746f"], tile: 1.4, carcass: DARK_CARCASS },
    },
    {
      id: "kamen-bijeli",
      name: "Dekor bijeli mramor",
      family: "kamen",
      swatch: marbleSwatch("#ece9e3", "#a4a09a", "#c2beb7"),
      pricePerMeter: 1240,
      render: {
        kind: "marble",
        color: "#e4e0d9",
        roughness: 0.3,
        clearcoat: 0.35,
        clearcoatRoughness: 0.18,
        tones: ["#e4e0d9", "#7b7873", "#a29e97"],
        tile: 1.8,
        carcass: LIGHT_CARCASS,
      },
    },
    {
      id: "kamen-tamni",
      name: "Dekor tamni kamen",
      family: "kamen",
      swatch: speckSwatch("#262626", "#5c5c5c"),
      pricePerMeter: 1200,
      render: { kind: "stone", color: "#242424", roughness: 0.5, tones: ["#232323", "#363636", "#7a7a7a"], tile: 1, density: 0.7, carcass: DARK_CARCASS },
    },

    // ---- metallic
    metal("bronca", "Bronca metalik", ["#7a5f45", "#55402d", "#a7865f"]),
    metal("sampanjac", "Šampanjac metalik", ["#b9a68a", "#8f7f68", "#ddd0b8"]),
    metal("titan", "Titan metalik", ["#5d5e60", "#3f4042", "#8a8c8f"]),
  ],

  topFamilies: [
    { id: "mramor", name: "Mramor" },
    { id: "kamen", name: "Granit i kamen" },
    { id: "kvarc", name: "Kvarc" },
    { id: "beton", name: "Beton" },
    { id: "kompakt", name: "Kompakt" },
    { id: "drvo", name: "Masivno drvo" },
    { id: "metal", name: "Inox" },
  ],

  tops: [
    {
      id: "mramor",
      name: "Bijeli mramor",
      family: "mramor",
      swatch: "linear-gradient(135deg,#f1eee8 0 38%,#9a968f 40%,#f1eee8 43% 68%,#b5b1aa 70%,#f1eee8 73%)",
      pricePerMeter: 520,
      featured: 1,
      render: {
        kind: "marble",
        color: "#e6e2db",
        roughness: 0.16,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        tones: ["#e6e2db", "#6c6964", "#99958e"],
        tile: 2.4,
      },
    },
    {
      id: "calacatta",
      name: "Calacatta mramor",
      family: "mramor",
      swatch: "linear-gradient(125deg,#f4f1eb 0 30%,#8e8577 33%,#b9a991 35%,#f4f1eb 39% 70%,#a39a8b 73%,#f4f1eb 76%)",
      pricePerMeter: 690,
      render: {
        kind: "marble",
        color: "#efebe4",
        roughness: 0.14,
        clearcoat: 0.65,
        clearcoatRoughness: 0.08,
        tones: ["#efebe4", "#6f665a", "#b3a48c"],
        tile: 2.8,
        veins: "bold",
      },
    },
    {
      id: "carrara",
      name: "Carrara mramor",
      family: "mramor",
      swatch: "linear-gradient(135deg,#e9e9e7 0 40%,#a9aaab 41%,#e9e9e7 43% 66%,#bfc0c1 67%,#e9e9e7 69%)",
      pricePerMeter: 560,
      render: {
        kind: "marble",
        color: "#e2e2e0",
        roughness: 0.18,
        clearcoat: 0.55,
        clearcoatRoughness: 0.12,
        tones: ["#e2e2e0", "#8a8c8f", "#b2b4b6"],
        tile: 1.8,
        density: 1.6,
      },
    },
    {
      id: "nero",
      name: "Nero Marquina",
      family: "mramor",
      swatch: "linear-gradient(135deg,#141414 0 38%,#d9d6cf 39.5%,#141414 41% 68%,#8f8c86 69%,#141414 70.5%)",
      pricePerMeter: 650,
      render: {
        kind: "marble",
        color: "#151515",
        roughness: 0.14,
        clearcoat: 0.7,
        clearcoatRoughness: 0.08,
        tones: ["#141414", "#d6d2ca", "#77746e"],
        tile: 2.2,
      },
    },
    {
      id: "crni",
      name: "Crni kamen",
      family: "kamen",
      swatch: speckSwatch("#141414", "#5a5a5a"),
      pricePerMeter: 450,
      featured: 2,
      render: {
        kind: "stone",
        color: "#151515",
        roughness: 0.3,
        metalness: 0.05,
        tones: ["#131313", "#262626", "#8a8a8a"],
        tile: 1,
      },
    },
    {
      id: "granit",
      name: "Sivi granit",
      family: "kamen",
      swatch: `radial-gradient(circle,#2b2b2b 0 1px,transparent 1.6px) 0 0/4px 4px,radial-gradient(circle,#e6e6e4 0 0.8px,transparent 1.3px) 2px 2px/5px 5px,#8c8b88`,
      pricePerMeter: 420,
      render: {
        kind: "stone",
        color: "#8a8986",
        roughness: 0.28,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        tones: ["#858481", "#2e2e2e", "#e2e1de"],
        tile: 0.9,
        density: 1.8,
      },
    },
    {
      id: "kvarc-bijeli",
      name: "Bijeli kvarc",
      family: "kvarc",
      swatch: speckSwatch("#f1efea", "#cfccc5"),
      pricePerMeter: 480,
      render: { kind: "stone", color: "#eeece7", roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.14, tones: ["#eeece7", "#d2cfc8", "#fbfaf7"], tile: 0.8, density: 0.5 },
    },
    {
      id: "kvarc-sivi",
      name: "Sivi kvarc",
      family: "kvarc",
      swatch: speckSwatch("#a9a8a4", "#8a8985"),
      pricePerMeter: 500,
      render: { kind: "stone", color: "#a6a5a1", roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.14, tones: ["#a6a5a1", "#8b8a86", "#c4c3bf"], tile: 0.8, density: 0.55 },
    },
    {
      id: "beton",
      name: "Sivi beton",
      family: "beton",
      swatch: "radial-gradient(circle at 30% 40%,#a3a19c,#86847f 70%)",
      pricePerMeter: 380,
      featured: 3,
      render: {
        kind: "concrete",
        color: "#8f8d88",
        roughness: 0.82,
        tones: ["#8f8d88", "#77756f", "#a9a7a1"],
        tile: 1.6,
      },
    },
    {
      id: "kompakt",
      name: "Bijeli kompakt",
      family: "kompakt",
      swatch: "linear-gradient(135deg,#f4f2ee,#e4e1db)",
      pricePerMeter: 300,
      render: { kind: "solid", color: "#efede8", roughness: 0.45 },
    },
    {
      id: "kompakt-crni",
      name: "Crni kompakt",
      family: "kompakt",
      swatch: "linear-gradient(135deg,#232325,#111112)",
      pricePerMeter: 330,
      render: { kind: "solid", color: "#161617", roughness: 0.5 },
    },
    {
      id: "hrast",
      name: "Hrastova ploča",
      family: "drvo",
      swatch: "repeating-linear-gradient(0deg,#a07a55 0 2px,#7d5b3b 2px 3px,#b48b63 3px 6px)",
      pricePerMeter: 260,
      featured: 4,
      render: {
        kind: "wood",
        color: "#a07a55",
        roughness: 0.5,
        tones: ["#a07a55", "#5a3f27", "#c9a27a"],
        tile: 1.2,
      },
    },
    {
      id: "orah",
      name: "Orahova ploča",
      family: "drvo",
      swatch: "repeating-linear-gradient(0deg,#5a3e29 0 2px,#3a2718 2px 3px,#76563a 3px 6px)",
      pricePerMeter: 340,
      render: { kind: "wood", color: "#5a3e29", roughness: 0.48, tones: ["#5a3e29", "#2c1d12", "#86634a"], tile: 1.2 },
    },
    {
      id: "inox",
      name: "Inox",
      family: "metal",
      swatch: metalSwatch("#d7d7d5", "#a9a9a7", "#c4c4c2"),
      pricePerMeter: 600,
      render: { kind: "brushed", color: "#b9b9b7", roughness: 0.32, metalness: 1, tones: ["#b6b6b4", "#9c9c9a", "#d2d2d0"], tile: 0.5 },
    },
  ],

  handles: [
    {
      id: "bez",
      name: "Bez ručki (profil Gola)",
      note: "Udubljeni profil ispod radne ploče: fronte se otvaraju hvatom za rub, linije ostaju čiste.",
      pricePerMeter: 90,
      coloured: true,
    },
    { id: "letvica", name: "Metalna letvica", note: "Tanka metalna letvica na svakoj fronti.", pricePerMeter: 45, coloured: true },
    { id: "gumb", name: "Okrugli gumb", note: "Mali okrugli gumb, klasičan i nenametljiv.", pricePerMeter: 25, coloured: true },
    {
      id: "utor",
      name: "Utorna ručka",
      note: "Tanki aluminijski profil u gornjem rubu fronte — hvat bez ijednog dijela koji strši.",
      pricePerMeter: 70,
      coloured: true,
    },
    {
      id: "push",
      name: "Otvaranje na dodir",
      note: "Bez ručki i bez profila: lagani pritisak na frontu i ona se otvori.",
      pricePerMeter: 60,
      coloured: false,
    },
  ],

  finishes: {
    handleColors: [
      {
        id: "crna",
        name: "Crna mat",
        golaName: "Crni profil",
        swatch: "linear-gradient(135deg,#3a3a3c,#111112)",
        priceAdd: 0,
        render: { color: "#151516", roughness: 0.42, metalness: 0.55 },
      },
      {
        id: "inox",
        name: "Inox",
        golaName: "Aluminijski profil",
        swatch: metalSwatch("#e2e2e0", "#a9a8a4", "#cfcecb"),
        priceAdd: 0,
        render: { color: "#b4b2ad", roughness: 0.34, metalness: 1 },
      },
      {
        id: "mesing",
        name: "Mesing",
        golaName: "Zlatni profil",
        swatch: metalSwatch("#e6cf9a", "#a8864f", "#c9ab72"),
        priceAdd: 18,
        render: { color: "#b8955a", roughness: 0.3, metalness: 1 },
      },
    ],
    sinks: [
      { id: "inox", name: "Inox", swatch: metalSwatch("#dcdcda", "#9e9e9c", "#c2c2c0"), priceAdd: 0, render: { color: "#8d8d8d", roughness: 0.34, metalness: 1 } },
      { id: "granit-crni", name: "Crni granit", swatch: speckSwatch("#1c1c1d", "#4a4a4a"), priceAdd: 140, render: { color: "#1b1b1c", roughness: 0.62, metalness: 0 } },
      { id: "granit-bijeli", name: "Bijeli granit", swatch: speckSwatch("#e4e1db", "#c4c0b8"), priceAdd: 140, render: { color: "#dcd8d0", roughness: 0.58, metalness: 0 } },
    ],
    taps: [
      { id: "inox", name: "Inox", swatch: metalSwatch("#ececea", "#a9a9a7", "#d0d0ce"), priceAdd: 0, render: { color: "#d2d2d2", roughness: 0.22, metalness: 1 } },
      { id: "crna", name: "Crna mat", swatch: "linear-gradient(135deg,#3a3a3c,#111112)", priceAdd: 60, render: { color: "#161617", roughness: 0.45, metalness: 0.5 } },
      { id: "mesing", name: "Mesing", swatch: metalSwatch("#e6cf9a", "#a8864f", "#c9ab72"), priceAdd: 120, render: { color: "#b8955a", roughness: 0.26, metalness: 1 } },
    ],
    appliances: [
      { id: "crno-staklo", name: "Crno staklo", swatch: "linear-gradient(135deg,#2a2a2d,#050506)", priceAdd: 0, render: { color: "#0a0a0b", roughness: 0.06, metalness: 0.2 } },
      { id: "inox", name: "Inox", swatch: metalSwatch("#e2e2e0", "#9c9c9a", "#c8c8c6"), priceAdd: 0, render: { color: "#b9b9b7", roughness: 0.3, metalness: 1 } },
    ],
    plinths: [
      { id: "crna", name: "Crno postolje", swatch: "#121213", priceAdd: 0, render: { color: "#0e0e0f", roughness: 0.7, metalness: 0 } },
      { id: "fronta", name: "U boji donjih fronti", swatch: "linear-gradient(135deg,#6f6a62,#3b3833)", priceAdd: 15, render: { color: "#0e0e0f", roughness: 0.7, metalness: 0 } },
      { id: "inox", name: "Inox", swatch: metalSwatch("#dcdcda", "#9e9e9c", "#c2c2c0"), priceAdd: 38, render: { color: "#a9a9a7", roughness: 0.3, metalness: 1 } },
    ],
    leds: [
      { id: "toplo", name: "Toplo bijelo", swatch: "radial-gradient(circle,#ffe2b8,#ffc57e)", priceAdd: 0, color: "#ffd29a" },
      { id: "neutralno", name: "Neutralno bijelo", swatch: "radial-gradient(circle,#fffaf2,#ffe9cf)", priceAdd: 0, color: "#fff0dc" },
    ],
  },

  room: {
    walls: [
      { id: "studio", name: "Tamni studio", swatch: "#1d1d20", color: "#1d1d20", roughness: 0.95 },
      { id: "bijela", name: "Topla bijela", swatch: "#e7e3da", color: "#d9d5cc", roughness: 0.92 },
      { id: "siva", name: "Svijetlosiva", swatch: "#c2c1bc", color: "#aeada8", roughness: 0.92 },
      { id: "pijesak", name: "Pijesak", swatch: "#cbbda5", color: "#b8aa92", roughness: 0.92 },
      { id: "kadulja", name: "Kadulja", swatch: "#9aa392", color: "#87907f", roughness: 0.92 },
      { id: "antracit", name: "Antracit", swatch: "#3b3c3f", color: "#333437", roughness: 0.92 },
    ],
    floors: [
      { id: "studio", name: "Tamni studio", swatch: "#121213", render: { kind: "solid", color: "#121213", roughness: 0.78 } },
      {
        id: "parket",
        name: "Parket hrast",
        swatch: "repeating-linear-gradient(90deg,#9a7752 0 18px,#7d5d3d 18px 19px,#a8845e 19px 37px,#7d5d3d 37px 38px)",
        render: { kind: "planks", color: "#9a7752", roughness: 0.55, tones: ["#94724e", "#5f442a", "#b99368"], tile: 2.4 },
      },
      {
        id: "beton",
        name: "Sivi beton",
        swatch: "radial-gradient(circle at 30% 40%,#8f8d88,#73716c 70%)",
        render: { kind: "concrete", color: "#7d7b76", roughness: 0.7, tones: ["#7d7b76", "#68665f", "#94928c"], tile: 3 },
      },
      {
        id: "plocice-svijetle",
        name: "Svijetle pločice",
        swatch: "linear-gradient(90deg,transparent 47%,#b9b5ad 48% 52%,transparent 53%) 0 0/22px 22px,linear-gradient(0deg,transparent 47%,#b9b5ad 48% 52%,transparent 53%) 0 0/22px 22px,#dcd8cf",
        render: { kind: "tiles", color: "#d6d2c9", roughness: 0.35, tones: ["#d6d2c9", "#c9c5bc", "#e3dfd7"], tile: 1.2, grout: "#a8a49c" },
      },
      {
        id: "plocice-tamne",
        name: "Tamne pločice",
        swatch: "linear-gradient(90deg,transparent 47%,#1c1c1d 48% 52%,transparent 53%) 0 0/22px 22px,linear-gradient(0deg,transparent 47%,#1c1c1d 48% 52%,transparent 53%) 0 0/22px 22px,#3d3c3a",
        render: { kind: "tiles", color: "#3a3937", roughness: 0.4, tones: ["#3a3937", "#2f2e2c", "#454441"], tile: 1.2, grout: "#1d1d1e" },
      },
    ],
  },

  moduleGroups: [
    { id: "ladice", name: "Ladice" },
    { id: "vrata", name: "Vrata i klapne" },
    { id: "voda", name: "Sudoper i pranje" },
    { id: "kuhanje", name: "Kuhanje" },
    { id: "aparati", name: "Aparati" },
    { id: "spremanje", name: "Spremanje" },
    { id: "otvoreno", name: "Otvoreno" },
    { id: "kut", name: "Kutni elementi" },
    { id: "prazno", name: "Bez elementa" },
  ],

  modules: [
    // ================================================================ base
    mod({
      id: "ladice",
      name: "Tri ladice",
      zone: "base",
      code: "l",
      group: "ladice",
      description: "Tri ladice s punim izvlačenjem i tihim zatvaranjem.",
      priceAdd: 220,
      widths: W_ALL,
      island: true,
    }),
    mod({
      id: "ladice2",
      name: "Dvije duboke ladice",
      zone: "base",
      code: "lb",
      group: "ladice",
      description: "Dvije visoke ladice za lonce, posude i aparate.",
      priceAdd: 170,
      widths: [40, 45, 50, 60, 80, 90],
      island: true,
    }),
    mod({
      id: "ladice4",
      name: "Četiri ladice",
      zone: "base",
      code: "lc",
      group: "ladice",
      description: "Četiri niže ladice — pribor, začini, krpe, sve pregledno.",
      priceAdd: 290,
      widths: [40, 45, 50, 60, 80, 90],
      island: true,
    }),
    mod({
      id: "ladice-unutarnja",
      name: "Ladice s unutarnjom ladicom",
      zone: "base",
      code: "lu",
      group: "ladice",
      description: "Dvije duboke ladice, a iza gornje fronte skrivena je još jedna plitka ladica za pribor.",
      priceAdd: 310,
      widths: [45, 50, 60, 80, 90],
      island: true,
    }),
    mod({
      id: "vrata",
      name: "Vrata s policom",
      zone: "base",
      code: "v",
      group: "vrata",
      description: "Jedna vrata i podesiva polica.",
      priceAdd: 0,
      widths: W_NARROW,
      cornerOk: true,
      island: true,
      sibling: "vrata2",
    }),
    mod({
      id: "vrata2",
      name: "Dvoja vrata s policom",
      zone: "base",
      code: "vv",
      group: "vrata",
      description: "Dvoja vrata i podesiva polica, za šire elemente.",
      priceAdd: 20,
      widths: W_WIDE,
      island: true,
      sibling: "vrata",
    }),
    mod({
      id: "sudoper",
      name: "Element za sudoper",
      zone: "base",
      code: "s",
      group: "voda",
      feature: "sink",
      description: "Podgradni sudoper, slavina i sifon.",
      priceAdd: 380,
      widths: [45, 50, 60, 80, 90],
      island: true,
    }),
    mod({
      id: "perilica",
      name: "Perilica posuđa",
      zone: "base",
      code: "d",
      group: "voda",
      feature: "dishwasher",
      description: "Mjesto za ugradbenu perilicu posuđa s frontom u boji kuhinje. Perilica nije uračunata u cijenu.",
      priceAdd: 90,
      widths: [45, 60],
      island: true,
    }),
    mod({
      id: "smece",
      name: "Izvlačni koš za smeće",
      zone: "base",
      code: "k",
      group: "voda",
      description: "Spremnici za razvrstavanje otpada izlaze zajedno s frontom — najbolje uz sudoper.",
      priceAdd: 240,
      widths: [30, 40, 45, 50, 60],
      island: true,
    }),
    mod({
      id: "ploca",
      name: "Ploča za kuhanje s ladicama",
      zone: "base",
      code: "p",
      group: "kuhanje",
      feature: "hob",
      description: "Mjesto za ugradbenu ploču za kuhanje, ispod nje dvije duboke ladice. Ploča nije uračunata u cijenu.",
      priceAdd: 150,
      widths: W_WIDE,
      island: true,
    }),
    mod({
      id: "ploca-pecnica",
      name: "Ploča i pećnica ispod",
      zone: "base",
      code: "pp",
      group: "kuhanje",
      feature: "hob",
      description: "Ploča za kuhanje, ispod nje ugradbena pećnica i ladica. Ploča i pećnica nisu uračunate u cijenu.",
      priceAdd: 260,
      widths: [60, 90],
      island: true,
    }),
    mod({
      id: "pecnica-donja",
      name: "Pećnica ispod radne ploče",
      zone: "base",
      code: "po",
      group: "kuhanje",
      description: "Ugradbena pećnica ispod radne ploče, ispod nje ladica. Pećnica nije uračunata u cijenu.",
      priceAdd: 220,
      widths: [60],
      island: true,
    }),
    mod({
      id: "boce",
      name: "Izvlačni stalak za boce",
      zone: "base",
      code: "b",
      group: "spremanje",
      description: "Uski izvlačni stalak za boce, ulje i začine — iskoristi i najuži razmak.",
      priceAdd: 190,
      widths: [15, 20, 30],
      island: true,
    }),
    mod({
      id: "police",
      name: "Otvorene police",
      zone: "base",
      code: "o",
      group: "otvoreno",
      description: "Otvoreni element s dvije police u boji fronte, za kraj kuhinje ili otoka.",
      priceAdd: 40,
      widths: W_NARROW,
      island: true,
      frontShare: 0.45,
      demo: false,
    }),
    mod({
      id: "slobodno",
      name: "Slobodno mjesto",
      zone: "base",
      code: "x",
      group: "prazno",
      description: "Bez elementa — radna ploča prolazi iznad, npr. za samostojeći aparat.",
      priceAdd: 0,
      widths: W_SPACER,
      minWidth: 5,
      maxWidth: 300,
      island: true,
      spacer: true,
      frontShare: 0,
      demo: false,
    }),
    // ---- blind corner units (corner slots only)
    mod({
      id: "kutni",
      name: "Kutni karusel",
      zone: "base",
      code: "kk",
      group: "kut",
      corner: true,
      description: "Dvije polukružne police okreću se s vratima iz slijepog kuta prema vama.",
      priceAdd: 420,
      widths: [90, 120],
    }),
    mod({
      id: "kutni-lemans",
      name: "Kutni LeMans",
      zone: "base",
      code: "kl",
      group: "kut",
      corner: true,
      description: "Dvije zaobljene police klize iz kuta van po zakrivljenoj putanji — nema izgubljenog prostora.",
      priceAdd: 520,
      widths: [90, 120],
    }),
    mod({
      id: "kutni-magic",
      name: "Kutni Magic corner",
      zone: "base",
      code: "km",
      group: "kut",
      corner: true,
      description: "Prednje košare izlaze s vratima, a stražnje se iz kuta pomaknu naprijed.",
      priceAdd: 640,
      widths: [90, 120],
    }),

    // ================================================================ upper
    mod({
      id: "vrata",
      name: "Gornja vrata",
      zone: "upper",
      code: "v",
      group: "vrata",
      description: "Zidni element s vratima i policom (dvoja vrata kod širih elemenata).",
      priceAdd: 0,
      widths: W_ALL,
      cornerOk: true,
    }),
    mod({
      id: "klapna",
      name: "Klapna koja se diže",
      zone: "upper",
      code: "f",
      group: "vrata",
      description: "Fronta se diže prema gore i ostaje otvorena — ništa ne smeta glavi.",
      priceAdd: 190,
      widths: [40, 45, 50, 60, 80, 90],
    }),
    mod({
      id: "klapna2",
      name: "Dvostruka klapna",
      zone: "upper",
      code: "ff",
      group: "vrata",
      description: "Dvije fronte koje se pri otvaranju preklope i podignu iznad elementa.",
      priceAdd: 290,
      widths: W_WIDE,
    }),
    mod({
      id: "vitrina",
      name: "Vitrina sa staklom i LED",
      zone: "upper",
      code: "g",
      group: "otvoreno",
      description: "Staklena vrata u okviru fronte, staklene police i unutarnja LED rasvjeta.",
      priceAdd: 160,
      widths: W_ALL,
      cornerOk: true,
    }),
    mod({
      id: "nisa",
      name: "Otvorena niša u hrastu",
      zone: "upper",
      code: "n",
      group: "otvoreno",
      description: "Otvorena polica od hrasta s LED trakom, za ono što želite imati pri ruci.",
      priceAdd: 60,
      widths: W_ALL,
      demo: false,
    }),
    mod({
      id: "polica",
      name: "Zidna polica",
      zone: "upper",
      code: "o",
      group: "otvoreno",
      description: "Masivna polica s LED trakom ispod, bez ormarića — prozračno i lagano.",
      priceAdd: 40,
      widths: W_ALL,
      frontShare: 0.2,
      demo: false,
    }),
    mod({
      id: "cjedilo",
      name: "Nosač za suđe",
      zone: "upper",
      code: "c",
      group: "voda",
      description: "Iza vrata žičani nosač za tanjure i čaše — iznad sudopera, da se suđe ocijedi.",
      priceAdd: 110,
      widths: [45, 50, 60, 80, 90],
    }),
    mod({
      id: "napa",
      name: "Element za ugradbenu napu",
      zone: "upper",
      code: "h",
      group: "kuhanje",
      hood: true,
      description: "Mjesto za napu skrivenu u zidnom elementu, s izvlačnim vizirom. Napa nije uračunata u cijenu.",
      priceAdd: 120,
      widths: W_WIDE,
    }),
    mod({
      id: "mikrovalna",
      name: "Ugradbena mikrovalna",
      zone: "upper",
      code: "m",
      group: "aparati",
      description: "Mikrovalna ugrađena u zidni element, iznad nje mala klapna. Mikrovalna nije uračunata u cijenu.",
      priceAdd: 160,
      widths: [60],
    }),
    mod({
      id: "prazno",
      name: "Bez gornjeg elementa",
      zone: "upper",
      code: "x",
      group: "prazno",
      description: "Na ovom dijelu zida nema zidnog elementa.",
      priceAdd: 0,
      widths: W_SPACER,
      minWidth: 5,
      maxWidth: 300,
      spacer: true,
      frontShare: 0,
      demo: false,
    }),

    // ================================================================ tall
    mod({
      id: "hladnjak",
      name: "Ugradbeni hladnjak",
      zone: "tall",
      code: "r",
      group: "aparati",
      description: "Visoki element za ugradbeni hladnjak sa zamrzivačem. Hladnjak nije uračunat u cijenu.",
      priceAdd: 350,
      widths: [60],
    }),
    mod({
      id: "pecnica",
      name: "Pećnica u visini očiju",
      zone: "tall",
      code: "o",
      group: "kuhanje",
      description: "Pećnica u visini očiju, ispod nje dvije ladice, iznad ormarić. Pećnica nije uračunata u cijenu.",
      priceAdd: 300,
      widths: [60],
    }),
    mod({
      id: "pecnica-mikro",
      name: "Pećnica i mikrovalna",
      zone: "tall",
      code: "om",
      group: "kuhanje",
      description: "Pećnica i iznad nje mikrovalna u visini očiju, ispod ladice. Aparati nisu uračunati u cijenu.",
      priceAdd: 420,
      widths: [60],
    }),
    mod({
      id: "smocnica",
      name: "Izvlačna smočnica",
      zone: "tall",
      code: "s",
      group: "spremanje",
      description: "Cijela smočnica izlazi van na jednom potezu, police su vidljive s obje strane.",
      priceAdd: 650,
      widths: [30, 40, 45, 50, 60],
    }),
    mod({
      id: "ormar",
      name: "Visoki ormar s policama",
      zone: "tall",
      code: "v",
      group: "spremanje",
      description: "Visoki ormar s podesivim policama (dvoja vrata kod širih ormara).",
      priceAdd: 80,
      widths: [40, 45, 50, 60, 80, 90],
    }),
    mod({
      id: "metle",
      name: "Ormar za metle i usisivač",
      zone: "tall",
      code: "b",
      group: "spremanje",
      description: "Visoki ormar s držačima za metlu i mop, mjestom za usisivač i policom gore.",
      priceAdd: 140,
      widths: [40, 45, 50, 60],
    }),
    mod({
      id: "perilica-rublja",
      name: "Perilica rublja",
      zone: "tall",
      code: "w",
      group: "aparati",
      description: "Mjesto za ugradbenu perilicu rublja iza vrata, iznad nje ormar. Perilica nije uračunata u cijenu.",
      priceAdd: 200,
      widths: [60],
    }),
  ],

  extras: {
    ledPerMeter: 45,
    ledFixed: 150,
    installPerMeter: 70,
    islandFixed: 650,
    backsplashShare: 1,
    spread: 0.08,
  },
};

// ================================================================ defaults

/** what an absent FinishSpec / RoomSpec field means */
export const FINISH_DEFAULTS = {
  sink: "inox",
  tap: "inox",
  appliances: "crno-staklo",
  plinth: "crna",
  led: "toplo",
  wall: "studio",
  floor: "studio",
} as const;

/** handle colour when the config does not set one: the Gola profile is black, every other grip inox */
export function defaultHandleColor(style: HandleStyle): string {
  return style === "bez" ? "crna" : "inox";
}

// ================================================================ lookups

export function frontDef(id: string): MaterialDef | undefined {
  return catalog.fronts.find((f) => f.id === id);
}
export function topDef(id: string): MaterialDef | undefined {
  return catalog.tops.find((t) => t.id === id);
}
export function handleDef(id: string): HandleDef | undefined {
  return catalog.handles.find((h) => h.id === id);
}
export function handleColorDef(id: string | undefined): HandleColorDef | undefined {
  return catalog.finishes.handleColors.find((h) => h.id === id);
}
/** finish option of one kind (sinks, taps, appliances, plinths, leds) */
export function finishDef<K extends Exclude<keyof Catalog["finishes"], "handleColors">>(kind: K, id: string | undefined): Catalog["finishes"][K][number] | undefined {
  const list = catalog.finishes[kind] as Catalog["finishes"][K][number][];
  return list.find((f) => f.id === id);
}
export function roomWallDef(id: string | undefined): RoomWallDef | undefined {
  return catalog.room.walls.find((w) => w.id === id);
}
export function roomFloorDef(id: string | undefined): RoomFloorDef | undefined {
  return catalog.room.floors.find((f) => f.id === id);
}
/** island slots use base types */
export function moduleDef(zone: ModuleZone | "island", id: string): ModuleTypeDef | undefined {
  const z: ModuleZone = zone === "island" ? "base" : zone;
  return catalog.modules.find((m) => m.zone === z && m.id === id);
}
/** module type by its share-link code */
export function moduleByCode(zone: ModuleZone | "island", code: string): ModuleTypeDef | undefined {
  const z: ModuleZone = zone === "island" ? "base" : zone;
  return catalog.modules.find((m) => m.zone === z && m.code === code);
}
/** true if `id` is a module type in any zone (used by the share-link validator) */
export function isModuleTypeId(id: string): boolean {
  return catalog.modules.some((m) => m.id === id);
}
/** the widths a type can be placed at: its catalogue widths (spacers: any whole cm between min and max) */
export function widthAllowed(def: ModuleTypeDef, width: number): boolean {
  if (def.spacer) return width >= def.minWidth - 1e-6 && width <= def.maxWidth + 1e-6;
  return def.widths.includes(Math.round(width)) && Math.abs(width - Math.round(width)) < 1e-6;
}
/** module types of a zone, in catalogue order (island = base types allowed on the island; corner types excluded) */
export function moduleTypes(zone: ModuleZone | "island"): ModuleTypeDef[] {
  const z: ModuleZone = zone === "island" ? "base" : zone;
  return catalog.modules.filter((m) => m.zone === z && !m.corner && (zone !== "island" || m.island));
}
/** types a blind-corner slot of this zone accepts */
export function cornerTypes(zone: "base" | "upper"): ModuleTypeDef[] {
  return catalog.modules.filter((m) => m.zone === zone && (m.corner || m.cornerOk));
}
