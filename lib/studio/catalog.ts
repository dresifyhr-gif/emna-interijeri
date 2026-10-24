/**
 * Studio catalogue — fronts, worktops, handles and module types (mechanisms).
 *
 * This file is DATA, not code: the engine, the price estimate, the summary and
 * the share-link validator all read it. Adding a front or a module type here is
 * enough for it to appear everywhere (the UI lists `catalog.*`).
 *
 * TODO(vlasnik): CIJENE NISU POTVRĐENE. Svaka brojka u ovoj datoteci (cijena po
 * metru fronte, radne ploče i ručki, doplata za svaki tip elementa, LED, montaža,
 * otok, udio zidne obloge i raspon ±) naša je procjena za kuhinje po mjeri u
 * Hrvatskoj, ne cjenik tvrtke: EUR, s PDV-om, bez kućanskih aparata (hladnjak,
 * pećnica, perilica posuđa, ploča za kuhanje i napa nisu uračunati, uračunata je
 * samo njihova ugradnja). Vlasnik mora potvrditi ili ispraviti svaku brojku prije
 * objave i tek onda postaviti PRICES_CONFIRMED na true. Dok je false, sučelje i
 * e-mailovi moraju jasno reći da cijena nije potvrđena (ili je ne prikazivati).
 *
 * Must stay free of three.js and DOM access (it is also imported server-side).
 */

import type { HandleStyle } from "./types";

/**
 * false until the owner has confirmed every rate in this file (see the TODO above).
 * The studio UI, the lead e-mails and anything else that shows a price read this flag.
 */
export const PRICES_CONFIRMED: boolean = false;

/** How the engine should render a material (interpreted by lib/studio/engine/materials.ts). */
export interface MaterialRender {
  /** "solid" = flat colour, the others get a procedural texture */
  kind: "solid" | "wood" | "marble" | "stone" | "concrete";
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
  /** carcass (cabinet body) colour that goes with this front */
  carcass?: string;
}

export interface MaterialDef {
  id: string;
  name: string;
  /** CSS `background` value for a swatch chip */
  swatch: string;
  /** EUR per running metre (see price.ts for how each zone uses it) */
  pricePerMeter: number;
  render: MaterialRender;
}

export interface HandleDef {
  id: HandleStyle;
  name: string;
  /** EUR per running metre of fronts */
  pricePerMeter: number;
}

export type ModuleZone = "base" | "upper" | "tall";

export interface ModuleTypeDef {
  /** unique within its zone ("vrata" exists both as a base and as an upper type) */
  id: string;
  name: string;
  zone: ModuleZone;
  description: string;
  /** EUR added on top of the per-metre price (mechanism, sink, integration …) */
  priceAdd: number;
  /** allowed carcass widths in cm (inclusive) */
  minWidth: number;
  maxWidth: number;
  /** only these exact widths (e.g. a dishwasher is 45 or 60) */
  widths?: number[];
  /** true = only for corner slots; corner slots also accept `cornerOk` types */
  corner?: boolean;
  /** may be used in a corner slot (the visible door part of a blind corner) */
  cornerOk?: boolean;
  /** may be used on the island (base types only) */
  island?: boolean;
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
  tops: MaterialDef[];
  handles: HandleDef[];
  modules: ModuleTypeDef[];
  extras: CatalogExtras;
}

const DARK_CARCASS = "#2f2d2a";
const LIGHT_CARCASS = "#dcd7ce";

export const catalog: Catalog = {
  fronts: [
    {
      id: "antracit",
      name: "Antracit mat",
      swatch: "#2c2d30",
      pricePerMeter: 950,
      render: { kind: "solid", color: "#2a2b2e", roughness: 0.62, carcass: DARK_CARCASS },
    },
    {
      id: "bijela",
      name: "Bijela mat",
      swatch: "#ebe8e2",
      pricePerMeter: 900,
      render: { kind: "solid", color: "#e7e4dd", roughness: 0.7, carcass: LIGHT_CARCASS },
    },
    {
      id: "lak",
      name: "Bijeli sjajni lak",
      swatch: "linear-gradient(135deg,#ffffff,#dcd8d0)",
      pricePerMeter: 1150,
      render: {
        kind: "solid",
        color: "#ebe8e1",
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        carcass: LIGHT_CARCASS,
      },
    },
    {
      id: "kasmir",
      name: "Kašmir mat",
      swatch: "#b6aa99",
      pricePerMeter: 950,
      render: { kind: "solid", color: "#b3a795", roughness: 0.66, carcass: LIGHT_CARCASS },
    },
    {
      id: "maslina",
      name: "Maslina mat",
      swatch: "#4c5848",
      pricePerMeter: 980,
      render: { kind: "solid", color: "#485443", roughness: 0.6, carcass: DARK_CARCASS },
    },
    {
      id: "hrast",
      name: "Hrast prirodni",
      swatch: "repeating-linear-gradient(90deg,#b08a5e 0 2px,#8e6b45 2px 3px,#c39d70 3px 6px)",
      pricePerMeter: 1350,
      render: {
        kind: "wood",
        color: "#b08a5e",
        roughness: 0.58,
        tones: ["#b08a5e", "#6e4f31", "#d3b088"],
        tile: 0.8,
        carcass: LIGHT_CARCASS,
      },
    },
    {
      id: "orah",
      name: "Orah",
      swatch: "repeating-linear-gradient(90deg,#5c412c 0 2px,#3a281a 2px 3px,#7a5a3e 3px 6px)",
      pricePerMeter: 1450,
      render: {
        kind: "wood",
        color: "#5c412c",
        roughness: 0.55,
        tones: ["#5c412c", "#2e1f14", "#8a6646"],
        tile: 0.8,
        carcass: DARK_CARCASS,
      },
    },
  ],

  tops: [
    {
      id: "mramor",
      name: "Bijeli mramor",
      swatch:
        "linear-gradient(135deg,#f1eee8 0 38%,#9a968f 40%,#f1eee8 43% 68%,#b5b1aa 70%,#f1eee8 73%)",
      pricePerMeter: 520,
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
      id: "crni",
      name: "Crni kamen",
      swatch: "radial-gradient(circle,#5a5a5a 0 1px,transparent 1.5px) 0 0/5px 5px,#141414",
      pricePerMeter: 450,
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
      id: "beton",
      name: "Sivi beton",
      swatch: "radial-gradient(circle at 30% 40%,#a3a19c,#86847f 70%)",
      pricePerMeter: 380,
      render: {
        kind: "concrete",
        color: "#8f8d88",
        roughness: 0.82,
        tones: ["#8f8d88", "#77756f", "#a9a7a1"],
        tile: 1.6,
      },
    },
    {
      id: "hrast",
      name: "Hrastova ploča",
      swatch: "repeating-linear-gradient(0deg,#a07a55 0 2px,#7d5b3b 2px 3px,#b48b63 3px 6px)",
      pricePerMeter: 260,
      render: {
        kind: "wood",
        color: "#a07a55",
        roughness: 0.5,
        tones: ["#a07a55", "#5a3f27", "#c9a27a"],
        tile: 1.2,
      },
    },
    {
      id: "kompakt",
      name: "Bijeli kompakt",
      swatch: "linear-gradient(135deg,#f4f2ee,#e4e1db)",
      pricePerMeter: 300,
      render: { kind: "solid", color: "#efede8", roughness: 0.45 },
    },
  ],

  handles: [
    { id: "bez", name: "Bez ručki (profil Gola)", pricePerMeter: 90 },
    { id: "letvica", name: "Metalna letvica", pricePerMeter: 45 },
    { id: "gumb", name: "Okrugli gumb", pricePerMeter: 25 },
  ],

  modules: [
    // ---------- base ----------
    {
      id: "ladice",
      name: "Tri ladice",
      zone: "base",
      description: "Tri ladice s punim izvlačenjem i tihim zatvaranjem.",
      priceAdd: 220,
      minWidth: 30,
      maxWidth: 90,
      island: true,
    },
    {
      id: "vrata",
      name: "Vrata s policom",
      zone: "base",
      description: "Element s vratima i podesivom policom.",
      priceAdd: 0,
      minWidth: 30,
      maxWidth: 90,
      cornerOk: true,
      island: true,
    },
    {
      id: "sudoper",
      name: "Element za sudoper",
      zone: "base",
      description: "Podgradni sudoper od inoksa, slavina i sifon.",
      priceAdd: 380,
      minWidth: 45,
      maxWidth: 90,
      island: true,
    },
    {
      id: "ploca",
      name: "Element za ploču za kuhanje",
      zone: "base",
      description: "Mjesto za ugradbenu ploču za kuhanje, ispod nje dvije duboke ladice. Ploča nije uračunata u cijenu.",
      priceAdd: 150,
      minWidth: 60,
      maxWidth: 90,
      island: true,
    },
    {
      id: "perilica",
      name: "Mjesto za perilicu posuđa",
      zone: "base",
      description: "Mjesto za ugradbenu perilicu posuđa s frontom u boji kuhinje. Perilica nije uračunata u cijenu.",
      priceAdd: 90,
      minWidth: 45,
      maxWidth: 60,
      widths: [45, 60],
      island: true,
    },
    {
      id: "kutni",
      name: "Kutni element s karuselom",
      zone: "base",
      description: "Police koje se iz slijepog kuta izvlače prema vama — nema izgubljenog prostora.",
      priceAdd: 420,
      minWidth: 90,
      maxWidth: 120,
      corner: true,
    },

    // ---------- upper ----------
    {
      id: "vrata",
      name: "Gornja vrata",
      zone: "upper",
      description: "Zidni element s vratima i policom.",
      priceAdd: 0,
      minWidth: 30,
      maxWidth: 90,
      cornerOk: true,
    },
    {
      id: "klapna",
      name: "Klapna koja se diže",
      zone: "upper",
      description: "Fronta se diže prema gore i ostaje otvorena — ništa ne smeta glavi.",
      priceAdd: 190,
      minWidth: 40,
      maxWidth: 90,
    },
    {
      id: "vitrina",
      name: "Vitrina sa staklenim vratima",
      zone: "upper",
      description: "Staklena vrata u okviru fronte, unutarnja LED rasvjeta.",
      priceAdd: 160,
      minWidth: 30,
      maxWidth: 90,
      cornerOk: true,
    },
    {
      id: "nisa",
      name: "Otvorena niša u hrastu",
      zone: "upper",
      description: "Otvorena polica od hrasta s LED trakom, za ono što želite imati pri ruci.",
      priceAdd: 60,
      minWidth: 30,
      maxWidth: 90,
    },
    {
      id: "napa",
      name: "Element za ugradbenu napu",
      zone: "upper",
      description: "Mjesto za napu skrivenu u zidnom elementu, s izvlačnim vizirom. Napa nije uračunata u cijenu.",
      priceAdd: 120,
      minWidth: 60,
      maxWidth: 90,
    },

    // ---------- tall ----------
    {
      id: "hladnjak",
      name: "Element za ugradbeni hladnjak",
      zone: "tall",
      description: "Visoki element za ugradbeni hladnjak sa zamrzivačem. Hladnjak nije uračunat u cijenu.",
      priceAdd: 350,
      minWidth: 60,
      maxWidth: 60,
    },
    {
      id: "pecnica",
      name: "Element za pećnicu",
      zone: "tall",
      description: "Pećnica u visini očiju, ispod nje dvije ladice, iznad ormarić. Pećnica nije uračunata u cijenu.",
      priceAdd: 300,
      minWidth: 60,
      maxWidth: 60,
    },
    {
      id: "smocnica",
      name: "Izvlačna smočnica",
      zone: "tall",
      description: "Cijela smočnica izlazi van na jednom potezu, police su vidljive s obje strane.",
      priceAdd: 650,
      minWidth: 30,
      maxWidth: 60,
    },
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

// ---------- lookups ----------

export function frontDef(id: string): MaterialDef | undefined {
  return catalog.fronts.find((f) => f.id === id);
}
export function topDef(id: string): MaterialDef | undefined {
  return catalog.tops.find((t) => t.id === id);
}
export function handleDef(id: string): HandleDef | undefined {
  return catalog.handles.find((h) => h.id === id);
}
/** island slots use base types */
export function moduleDef(zone: ModuleZone | "island", id: string): ModuleTypeDef | undefined {
  const z: ModuleZone = zone === "island" ? "base" : zone;
  return catalog.modules.find((m) => m.zone === z && m.id === id);
}
/** true if `id` is a module type in any zone (used by the share-link validator) */
export function isModuleTypeId(id: string): boolean {
  return catalog.modules.some((m) => m.id === id);
}
