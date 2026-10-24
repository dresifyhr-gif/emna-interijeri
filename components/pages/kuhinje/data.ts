import type { CSSProperties } from "react";
import type { Shape } from "@/lib/gallery";
import type { MechanismId } from "../drawings/Mechanisms";

/**
 * Copy for /kuhinje. General descriptions only — no brand names, guarantees or numbers
 * the owner hasn't confirmed. Studio links use `?oblik=` (layout) and `?front=` / `?top=`
 * with ids from lib/studio/catalog.ts; unknown ids fall back to defaults in the studio.
 */

export const shapes: { id: Shape; name: string; text: string }[] = [
  {
    id: "ravna",
    name: "Ravna",
    text: "Sve uz jedan zid. Za uže prostore i kuhinje otvorene prema dnevnom boravku: čista linija i jednostavno kretanje.",
  },
  {
    id: "L",
    name: "L-kuhinja",
    text: "Dva susjedna zida i pravi kutni element. Više radne površine i pohrane, a sudoper, ploča i hladnjak prirodno tvore radni trokut.",
  },
  {
    id: "U",
    name: "U-kuhinja",
    text: "Tri zida, najviše pohrane i radne površine. Za veće kuhinje u kojima se puno kuha i sve treba biti na dohvat ruke.",
  },
  {
    id: "otok",
    name: "S otokom",
    text: "Samostojeći otok za pripremu, kuhanje ili sjedenje. Oko otoka planiramo prolaz od 90 do 120 cm, ovisno o tome koliko se ljudi mimoilazi.",
  },
];

export const mechanisms: { id: MechanismId; name: string; text: string }[] = [
  {
    id: "ladice",
    name: "Ladice s tihim zatvaranjem",
    text: "Ladice na punom izvlačenju, s prigušivačem koji ih zadnjih nekoliko centimetara zatvori sam i tiho. U donjim elementima često zamjenjuju vrata, pa je sve vidljivo odozgo.",
  },
  {
    id: "klapne",
    name: "Klapne koje se dižu",
    text: "Gornji elementi otvaraju se prema gore i ostaju u položaju u kojem ih pustite. Nema krila vrata ispred lica dok radite.",
  },
  {
    id: "karusel",
    name: "Kutni karuseli",
    text: "Kut L i U kuhinje inače ostaje mrtav prostor. Okretne ili izvlačne police donose njegov sadržaj na dohvat ruke.",
  },
  {
    id: "smocnica",
    name: "Izvlačne smočnice",
    text: "Visoki element s policama koje izlaze cijele i dostupne su s obje strane. Namirnice su pregledne i ništa ne nestaje u dubini.",
  },
  {
    id: "dodir",
    name: "Otvaranje na dodir",
    text: "Za fronte bez ručki: lagani pritisak i vrata ili ladica se otvore. Ploha ostaje čista, bez ijednog detalja koji strši.",
  },
];

export type Material = { name: string; text: string; swatch: CSSProperties; studio?: string };

export const fronts: Material[] = [
  {
    name: "Mat lak",
    text: "Lakirani MDF svilenkaste površine bez odsjaja, u boji po izboru. Miran, ujednačen izgled.",
    swatch: { background: "linear-gradient(140deg,#3d3d41 0%,#2a2a2e 100%)" },
    studio: "/studio?front=antracit",
  },
  {
    name: "Visoki sjaj",
    text: "Lak visokog sjaja odbija svjetlo i optički otvara prostor. Najbolje stoji u mirnim, jednobojnim kuhinjama.",
    swatch: {
      background: "linear-gradient(125deg,#e9e6e0 0%,#d6d2cb 42%,#ffffff 49%,#e2ded7 55%,#cbc7bf 100%)",
    },
    studio: "/studio?front=lak",
  },
  {
    name: "Furnir",
    text: "Tanki list pravog drva na stabilnoj podlozi. Toplina i godovi drva, a manja osjetljivost na vlagu od masivnog drva.",
    swatch: {
      background:
        "repeating-linear-gradient(98deg,#8b6a47 0 3px,#9b7a55 3px 8px,#80613f 8px 10px,#94734f 10px 15px)",
    },
    studio: "/studio?front=hrast",
  },
  {
    name: "Dekor ploče",
    text: "Ploče s dekorom drva, betona ili kamena. Otporne, jednostavne za održavanje i povoljnije od laka.",
    swatch: {
      background:
        "radial-gradient(circle at 25% 30%,rgba(255,255,255,.12) 0 2px,transparent 3px) 0 0/11px 11px,linear-gradient(135deg,#8f8c86,#76736e)",
    },
  },
];

export const tops: Material[] = [
  {
    name: "Laminat i kompakt",
    text: "Laminat je najpristupačniji izbor. Kompakt ploča je tanka, gusta i otporna na vodu i udarce.",
    swatch: { background: "linear-gradient(135deg,#2c2b29,#1b1a19)" },
    studio: "/studio?top=kompakt",
  },
  {
    name: "Kvarc",
    text: "Kvarcni kompozit: neporozan, otporan na mrlje, ujednačene boje i uzorka.",
    swatch: {
      background:
        "radial-gradient(circle,rgba(120,114,104,.55) 0 1px,transparent 1.5px) 0 0/6px 6px,linear-gradient(135deg,#e2ded6,#d4cfc5)",
    },
  },
  {
    name: "Keramika",
    text: "Vrlo tvrda ploča otporna na toplinu i ogrebotine. Uvjerljivo prenosi izgled mramora i betona.",
    swatch: {
      background:
        "linear-gradient(118deg,#f0ede7 0%,#f0ede7 38%,#a9a296 39.5%,#f0ede7 41.5%,#ebe7e0 66%,#bdb6aa 67.5%,#efece6 69%)",
    },
    // no studio link: the studio has no ceramic top, and "mramor" would send the lead as natural marble
  },
  {
    name: "Prirodni kamen",
    text: "Granit i mramor: svaka ploča je jedinstvena. Traže impregnaciju i malo više pažnje u svakodnevnom korištenju.",
    swatch: {
      background:
        "radial-gradient(circle at 30% 40%,#6b6b6b 0 1px,transparent 2px) 0 0/7px 7px,radial-gradient(circle at 70% 60%,#9a9a9a 0 1px,transparent 2px) 0 0/9px 9px,#2a2a2c",
    },
    studio: "/studio?top=crni",
  },
  {
    name: "Drvo",
    text: "Masivna drvena ploča donosi toplinu. Najbolje se pokazuje na otoku i u zoni sjedenja, dalje od sudopera.",
    swatch: {
      background: "repeating-linear-gradient(90deg,#b48a5c 0 4px,#a67b4f 4px 9px,#bf9568 9px 13px)",
    },
    studio: "/studio?top=hrast",
  },
];

/** Kitchen photos shown on /kuhinje (all real, from /public/galerija). */
export const kitchenPicks = [
  "/galerija/kuhinja-zelena-crni-mramor-2.jpg",
  "/galerija/kuhinja-bijela-drvo-velik.jpg",
  "/galerija/kuhinja-crna-drvo-otok.jpg",
  "/galerija/kuhinja-mint-drvo.jpg",
  "/galerija/kuhinja-bijela-zlato.jpg",
];
