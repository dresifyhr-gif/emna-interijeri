/**
 * Free Croatian words → catalogue ids ("bijeli lak" → front "lak", "crni kamen" → worktop "crni", "gola" → handles "bez").
 *
 * The model is asked for catalogue ids, but it may pass the customer's own words (or an inflected form: "crnim
 * kamenom", "hrastovim frontama"). Every material field of a brief / an edit goes through here, so an id, a name from
 * the catalogue or a common synonym all land on the same id — and anything unknown returns null (the composer keeps
 * the default and says so). Pure, no zod, no server code: safe anywhere.
 */
import { backsplashDef, catalog } from "../catalog";
import type { BacksplashKind, HandleStyle } from "../types";

/** lower case, no diacritics (č ć š ž đ), only letters / digits separated by single spaces */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** the stem a word of a phrase must start (Croatian case endings: "crni" ~ "crnim", "kamen" ~ "kamenom") */
const stem = (w: string) => (w.length > 4 ? w.replace(/[aeiou]$/, "") : w);

interface Entry {
  id: string;
  /** normalized phrases, each a list of words */
  phrases: string[][];
}

function entries(items: readonly { id: string; name: string }[], extra: Record<string, string[]> = {}): Entry[] {
  return items.map((it) => ({
    id: it.id,
    phrases: [it.id.replace(/-/g, " "), it.name, ...(extra[it.id] ?? [])].map((p) => norm(p).split(" ").filter(Boolean)).filter((p) => p.length > 0),
  }));
}

/** how well a phrase occurs in the input words (consecutive, each input word starting with the phrase word's stem): its letters, or 0 */
function phraseScore(words: string[], phrase: string[]): number {
  outer: for (let i = 0; i + phrase.length <= words.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      const p = phrase[j];
      const w = words[i + j];
      // short words ("lak", "bez") only with a short case ending ("lakom"), longer ones by their stem ("crni" ~ "crnim")
      const ok = p.length <= 3 ? w === p || (w.startsWith(p) && w.length <= p.length + 2) : w === p || w.startsWith(stem(p));
      if (!ok) continue outer;
    }
    return phrase.reduce((n, p) => n + p.length, 0) + (phrase.length - 1);
  }
  return 0;
}

function match(table: Entry[], input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;
  const exact = table.find((e) => e.id === raw || e.id === raw.toLowerCase());
  if (exact) return exact.id;
  const words = norm(raw).split(" ").filter(Boolean);
  if (!words.length) return null;
  let best: { id: string; score: number } | null = null;
  for (const e of table) {
    for (const p of e.phrases) {
      const s = phraseScore(words, p);
      if (s > 0 && (!best || s > best.score)) best = { id: e.id, score: s };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------- fronts

const FRONTS = entries(catalog.fronts, {
  antracit: ["antracit mat", "antracitna"],
  bijela: ["bijeli", "bijela mat", "bijeli mat", "white", "bijele fronte"],
  krem: ["krem mat", "krem boja", "kremasta"],
  kasmir: ["kasmir", "kašmir"],
  pijesak: ["bež", "bez boja", "pijesak", "pjescana", "beige"],
  "siva-svijetla": ["svijetlo siva", "svijetlosiva", "siva svijetla", "svijetla siva", "siva", "sivi", "sive"],
  "siva-tamna": ["tamno siva", "tamnosiva", "tamna siva"],
  grafit: ["grafitna", "grafitno siva"],
  crna: ["crni", "crne", "crna mat", "crni mat", "black"],
  maslina: ["maslinasta", "maslinasto zelena"],
  kadulja: ["kadulja", "sage", "svijetlo zelena", "svijetlozelena"],
  "zelena-tamna": ["tamno zelena", "tamnozelena", "zelena", "zelene", "bocno zelena"],
  petrolej: ["petrol", "petrolej plava"],
  "plava-nocna": ["nocno plava", "tamno plava", "tamnoplava", "plava", "navy"],
  terakota: ["terakota", "ciglasta"],
  bordo: ["bordo crvena", "bordo"],
  lak: ["bijeli lak", "bijela lak", "bijeli sjaj", "bijela sjajna", "sjajna bijela", "lak", "lakirana", "visoki sjaj", "sjajne", "sjajna"],
  "krem-sjaj": ["krem lak", "krem sjaj", "krem sjajna"],
  "siva-sjaj": ["sivi lak", "siva lak", "siva sjajna", "sivi sjaj"],
  "antracit-sjaj": ["antracit lak", "antracit sjaj", "antracit sjajna"],
  "crna-sjaj": ["crni lak", "crna lak", "crna sjajna", "crni sjaj"],
  hrast: ["hrast", "hrastova", "hrastove", "drvo", "drvena", "drvene", "furnir", "prirodni hrast"],
  "hrast-bijeljeni": ["bijeljeni hrast", "svijetli hrast", "hrast svijetli"],
  "hrast-dimljeni": ["dimljeni hrast", "tamni hrast", "hrast tamni"],
  "hrast-crni": ["crni hrast", "crno bajcani hrast", "hrast crni"],
  orah: ["orah", "orahova"],
  jasen: ["jasen", "jasenova"],
  tik: ["tik", "teak"],
  "beton-svijetli": ["beton", "svijetli beton", "betonske"],
  "beton-tamni": ["tamni beton"],
  "kamen-bijeli": ["mramor", "bijeli mramor", "mramorne"],
  "kamen-tamni": ["tamni kamen", "kamen"],
  bronca: ["bronca", "broncana", "brončane"],
  sampanjac: ["sampanjac", "šampanjac", "champagne"],
  titan: ["titan", "metalik"],
});

export function resolveFront(words: string | null | undefined): string | null {
  return match(FRONTS, words);
}

// ---------------------------------------------------------------- worktops

const TOPS = entries(catalog.tops, {
  mramor: ["mramor", "bijeli mramor", "mramorna"],
  calacatta: ["calacatta", "kalakata"],
  carrara: ["carrara", "karara"],
  nero: ["nero", "nero marquina", "crni mramor"],
  "nero-zlatni": ["nero zlatni", "crni mramor zlatni", "crni mramor sa zlatnim", "crni mramor zlatne zile", "port laurent", "port laurent"],
  "calacatta-zlatni": ["calacatta zlatni", "calacatta gold", "bijeli mramor zlatni", "bijeli mramor sa zlatnim"],
  crni: ["crni kamen", "crna ploca", "crni granit", "crna", "crni", "kamen crni", "tamni kamen", "kamen"],
  granit: ["granit", "sivi granit", "sivi kamen"],
  "kvarc-bijeli": ["bijeli kvarc", "kvarc", "bijela ploca", "bijeli kamen", "bijela"],
  "kvarc-sivi": ["sivi kvarc", "siva ploca", "siva"],
  "kvarc-grafit": ["grafitni kvarc", "tamni kvarc", "grafit"],
  beton: ["beton", "sivi beton", "betonska"],
  kompakt: ["kompakt", "bijeli kompakt", "kompaktna"],
  "kompakt-crni": ["crni kompakt"],
  hrast: ["hrast", "hrastova", "drvena ploca", "drvo", "drvena"],
  orah: ["orah", "orahova"],
  inox: ["inox", "nehrdajuci celik", "celik"],
});

export function resolveTop(words: string | null | undefined): string | null {
  return match(TOPS, words);
}

// ---------------------------------------------------------------- handles

/** how the fronts open; "gola" wins over a generic "ručkice" ("ručkice gola" = handleless with the Gola profile) */
export function resolveHandles(words: string | null | undefined): HandleStyle | null {
  if (typeof words !== "string") return null;
  const n = ` ${norm(words)} `;
  if (!n.trim()) return null;
  const has = (...ps: string[]) => ps.some((p) => n.includes(` ${p} `) || n.includes(` ${p}`));
  if (/^\s*(bez|letvica|gumb|utor|push|luft)\s*$/.test(n)) return n.trim() as HandleStyle;
  if (has("gola", "bez ruc", "bez ruck", "profil")) return "bez";
  if (has("luft", "za prste", "prst")) return "luft";
  if (has("push", "tip on", "tipon", "na dodir", "dodir", "pritisak")) return "push";
  if (has("utor", "j profil", "urezan")) return "utor";
  if (has("gumb", "kugl", "okrugl")) return "gumb";
  if (has("letv", "ruc", "sipk", "ruck", "dugack")) return "letvica";
  return null;
}

// ---------------------------------------------------------------- hardware / appliance finishes

const HANDLE_COLORS = entries(catalog.finishes.handleColors, {
  crna: ["crne", "crni", "crna"],
  inox: ["inox", "celik", "srebrne"],
  mesing: ["mesing", "zlatne", "zlatna", "zlato", "brass"],
  bijela: ["bijele", "bijela"],
  alu: ["aluminij", "alu", "srebrna", "aluminijske"],
});
export const resolveHandleColor = (w: string | null | undefined) => match(HANDLE_COLORS, w);

const SINKS = entries(catalog.finishes.sinks, {
  inox: ["inox", "celik"],
  "granit-crni": ["crni", "crna", "crni granit", "crni sudoper", "tamni"],
  "granit-bijeli": ["bijeli", "bijela", "bijeli granit"],
});
export const resolveSinkFinish = (w: string | null | undefined) => match(SINKS, w);

const TAPS = entries(catalog.finishes.taps, { inox: ["inox", "krom", "srebrna"], crna: ["crna", "crni"], mesing: ["mesing", "zlatna", "zlatni"] });
export const resolveTap = (w: string | null | undefined) => match(TAPS, w);

const APPLIANCES = entries(catalog.finishes.appliances, { "crno-staklo": ["crno", "crni", "crna", "staklo"], inox: ["inox", "celik"] });
export const resolveAppliances = (w: string | null | undefined) => match(APPLIANCES, w);

const PLINTHS = entries(catalog.finishes.plinths, {
  crna: ["crno", "crna", "crni"],
  fronta: ["kao fronte", "u boji fronti", "boja fronti", "fronta"],
  inox: ["inox"],
  alu: ["aluminij", "alu"],
});
export const resolvePlinth = (w: string | null | undefined) => match(PLINTHS, w);

const FRIDGES = entries(catalog.finishes.fridges, {
  inox: ["inox", "celik", "srebrni"],
  "tamni-inox": ["tamni inox", "grafit", "antracit", "tamni"],
  crni: ["crni", "crna"],
  bijeli: ["bijeli", "bijela"],
});
export const resolveFridgeFinish = (w: string | null | undefined) => match(FRIDGES, w);

const LEDS = entries(catalog.finishes.leds, { toplo: ["toplo", "topla", "toplo bijelo"], neutralno: ["neutralno", "hladno", "hladna", "bijelo"] });
export const resolveLed = (w: string | null | undefined) => match(LEDS, w);

// ---------------------------------------------------------------- room

const ROOM_WALLS = entries(catalog.room.walls, {
  studio: ["tamni studio", "studio"],
  bijela: ["bijela", "bijeli", "bijeli zid"],
  siva: ["siva", "svijetlosiva", "sivi"],
  pijesak: ["bez", "bež", "pijesak"],
  kadulja: ["kadulja", "zelena", "svijetlo zelena"],
  antracit: ["antracit", "tamno siva"],
  kreda: ["kreda", "kredasta"],
  greige: ["greige", "sivo bez"],
  "zelena-duboka": ["tamno zelena", "duboka zelena"],
  "plava-mornarska": ["plava", "tamno plava", "mornarska"],
  ugljen: ["ugljen", "crna", "crni"],
  cigla: ["cigla", "ciglani", "opeka"],
  "cigla-bijela": ["bijela cigla", "bijela opeka"],
  "plocice-zid": ["plocice", "metro plocice"],
});
export const resolveRoomWall = (w: string | null | undefined) => match(ROOM_WALLS, w);

const FLOORS = entries(catalog.room.floors, {
  studio: ["tamni studio", "studio"],
  parket: ["parket", "hrastov parket", "drveni pod"],
  "parket-svijetli": ["svijetli parket"],
  "parket-tamni": ["tamni parket"],
  "riblja-kost": ["riblja kost", "riblja", "herringbone"],
  chevron: ["chevron"],
  beton: ["beton", "betonski"],
  "plocice-svijetle": ["svijetle plocice", "plocice", "bijele plocice"],
  "plocice-tamne": ["tamne plocice", "crne plocice"],
  terazzo: ["terazzo", "teraco"],
  mikrocement: ["mikrocement"],
  "laminat-sivi-hrast": ["laminat", "sivi hrast"],
  "hrast-bijeli": ["bijeli hrast"],
  "orah-tamni": ["orah", "tamni orah"],
});
export const resolveFloor = (w: string | null | undefined) => match(FLOORS, w);

// ---------------------------------------------------------------- backsplash

const SPLASHES = entries(catalog.backsplashes, {
  "staklo-bijelo": ["bijelo staklo"],
  "staklo-crno": ["crno staklo"],
  "staklo-sivo": ["sivo staklo"],
  "subway-bijele": ["metro plocice", "metro", "subway", "bijele plocice"],
  "subway-zelene": ["zelene metro", "zelene plocice"],
  "hex-bijele": ["heksagon", "hex", "sestero"],
  "hex-crne": ["crni heksagon", "crne hex", "crne plocice"],
  "zellige-bijele": ["zellige", "bijele zellige"],
});

/** "kao ploča" / "do pola" / "bez" / "crno staklo" / "metro pločice" → KitchenConfig.backsplash */
export function resolveBacksplash(words: string | null | undefined): { kind: BacksplashKind; finish?: string } | null {
  if (typeof words !== "string" || !words.trim()) return null;
  const raw = words.trim();
  if (raw === "ploca" || raw === "pola" || raw === "bez" || raw === "staklo" || raw === "plocice") return { kind: raw };
  const def = backsplashDef(raw);
  if (def) return { kind: def.kind, finish: def.id };
  const id = match(SPLASHES, raw);
  if (id) {
    const d = backsplashDef(id);
    if (d) return { kind: d.kind, finish: d.id };
  }
  const n = ` ${norm(raw)} `;
  if (n.includes(" pola ") || n.includes(" polovic")) return { kind: "pola" };
  if (n.includes(" bez ") || n.includes(" nema ") || n.includes(" zid ")) return { kind: "bez" };
  if (n.includes(" stakl")) return { kind: "staklo" };
  if (n.includes(" ploci")) return { kind: "plocice" };
  if (n.includes(" ploc") || n.includes(" kamen") || n.includes(" kao ")) return { kind: "ploca" };
  return null;
}
