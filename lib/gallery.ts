/**
 * Real EMNA installation photos in /public/galerija (all 4:3), grouped by kitchen: several photos of one kitchen are one
 * project with one title. Titles describe what is in the photos only — no invented locations or clients.
 * The grouping is read from the photos (same fronts, worktop and room = same kitchen); to correct it, move a file to
 * another kitchen below. A photo's `src` never changes: other pages look photos up by it (and by its file name).
 * TODO(vlasnik): potvrditi da su sve fotke vaše realizacije i da je grupiranje po kuhinjama točno; dodati grad ako želite.
 */
import type { Layout } from "./studio/types";

export type Shape = "ravna" | "L" | "U" | "otok";
export type Style = "moderna" | "minimal" | "premium" | "klasicna";

/**
 * The closest look in the 3D studio (/studio?oblik=…&front=…&top=…): ids from lib/studio/catalog.ts, read by
 * configFromQuery (lib/studio/share.ts). Only where one front and one worktop really describe the kitchen —
 * two-tone kitchens and panelled classic fronts have none.
 */
export interface StudioLook {
  oblik: Layout;
  front: string;
  top: string;
}

export interface Photo {
  src: string;
  w: number;
  h: number;
  title: string;
  style: Style;
  shape?: Shape;
  /** the kitchen in the photo (Project.id) */
  project: string;
}

export interface Project {
  id: string;
  title: string;
  style: Style;
  shape?: Shape;
  studio?: StudioLook;
  photos: Photo[];
  /** the photo that stands for the kitchen in grids (its first) */
  cover: Photo;
}

type Shot = { file: string; w: number; h: number };
const f = (file: string, w = 1400, h = 1050): Shot => ({ file, w, h });

type Kitchen = Omit<Project, "photos" | "cover"> & { files: Shot[] };

/**
 * Display order. The first five are five different kitchens (homepage "Naši radovi", top of /radovi, its share
 * image), led by the owner's favourites; covers are full-size photos without loose cables in view. The first cover
 * (kuhinja-siva-mramor, the owner's own pick) shows a factory sticker on the oven glass: kept on purpose, flagged for
 * the owner in docs/PRIJE-OBJAVE.md section 5.
 */
const kitchens: Kitchen[] = [
  {
    id: "antracit-mramor",
    title: "Antracit L-kuhinja s mramornom pločom",
    style: "premium",
    shape: "L",
    studio: { oblik: "L", front: "antracit", top: "mramor" },
    files: [f("kuhinja-siva-mramor"), f("kuhinja-crna-mramor-2")],
  },
  {
    id: "beton-mramor",
    title: "L-kuhinja u dekoru betona s mramornim zidom",
    style: "moderna",
    shape: "L",
    studio: { oblik: "L", front: "beton-svijetli", top: "calacatta" },
    files: [f("kuhinja-beton-mramor-2"), f("kuhinja-beton-mramor"), f("kuhinja-siva-mramor-2")],
  },
  {
    id: "bijela-sjaj-hrast",
    title: "Bijela sjajna L-kuhinja s hrastovim zidom",
    style: "minimal",
    shape: "L",
    studio: { oblik: "L", front: "lak", top: "hrast" },
    files: [f("kuhinja-bijela-gloss"), f("kuhinja-bijela-gloss-2", 1200, 900), f("kuhinja-bijela-drvo-2")],
  },
  {
    id: "tamnosiva-mramor",
    title: "Tamnosiva U-kuhinja s drvom i crnim mramorom",
    style: "premium",
    shape: "U",
    studio: { oblik: "U", front: "siva-tamna", top: "hrast" },
    files: [f("kuhinja-zelena-crni-mramor-2"), f("kuhinja-zelena-crni-mramor")],
  },
  {
    id: "bijela-zlato",
    title: "Bijela kuhinja s otokom i zlatnim frontama",
    style: "premium",
    shape: "otok",
    studio: { oblik: "otok", front: "lak", top: "calacatta-zlatni" },
    files: [f("kuhinja-bijela-zlato")],
  },

  {
    id: "crna-drvo-otok",
    title: "Crna kuhinja s drvenim otokom i granitnom pločom",
    style: "premium",
    shape: "otok",
    files: [f("kuhinja-crna-drvo-otok")],
  },
  {
    id: "kadulja-hrast",
    title: "Kuhinja boje kadulje s hrastovim elementima",
    style: "moderna",
    shape: "L",
    studio: { oblik: "L", front: "kadulja", top: "hrast" },
    files: [f("kuhinja-mint-drvo"), f("kuhinja-zelena-drvo-2")],
  },
  {
    id: "antracit-hrast",
    title: "Antracit L-kuhinja s hrastovim gornjim elementima",
    style: "moderna",
    shape: "L",
    studio: { oblik: "L", front: "antracit", top: "hrast" },
    files: [f("kuhinja-tamna-drvo-l", 1200, 900), f("kuhinja-zelena-drvo", 1024, 768)],
  },
  {
    id: "bijela-vitrina-otok",
    title: "Bijela kuhinja s otokom, crnom pločom i vitrinom",
    style: "premium",
    shape: "otok",
    studio: { oblik: "otok", front: "lak", top: "crni" },
    files: [f("kuhinja-bijela-crna-otok")],
  },
  {
    id: "antracit-blagovaonica",
    title: "Antracit kuhinja s hrastovim zidom i blagovaonicom",
    style: "moderna",
    shape: "ravna",
    studio: { oblik: "ravna", front: "antracit", top: "hrast" },
    files: [f("kuhinja-crna-drvo-sala")],
  },
  {
    id: "bijela-hrast-otok",
    title: "Bijela kuhinja s otokom i hrastovim detaljima",
    style: "premium",
    shape: "otok",
    studio: { oblik: "otok", front: "bijela", top: "kvarc-bijeli" },
    files: [f("kuhinja-bijela-drvo-velik")],
  },
  {
    id: "tamnosiva-mozaik",
    title: "Tamnosiva L-kuhinja s mozaik pločicama",
    style: "moderna",
    shape: "L",
    studio: { oblik: "L", front: "siva-tamna", top: "hrast" },
    files: [f("kuhinja-siva-mozaik")],
  },
  {
    id: "hrast-bijela",
    title: "L-kuhinja u hrastu s bijelim gornjim elementima",
    style: "moderna",
    shape: "L",
    studio: { oblik: "L", front: "hrast", top: "hrast" },
    files: [f("kuhinja-drvo-bijela-2")],
  },
  {
    id: "bijela-klasicna",
    title: "Bijela klasična L-kuhinja s uzorkastim pločicama",
    style: "klasicna",
    shape: "L",
    files: [f("kuhinja-bijela-klasicna"), f("kuhinja-bijela-klasicna-2")],
  },
  {
    id: "sivobez-granit",
    title: "Sivobež kuhinja s crnom granitnom pločom",
    style: "moderna",
    shape: "ravna",
    studio: { oblik: "ravna", front: "kasmir", top: "crni" },
    files: [f("kuhinja-smedja-crna")],
  },
  {
    // a peninsula, not an island: no shape filter fits it
    id: "crno-bijela-sjaj",
    title: "Crno-bijela kuhinja visokog sjaja s poluotokom",
    style: "premium",
    files: [f("kuhinja-crna-bijela-otok")],
  },
  {
    id: "bijela-granit-otok",
    title: "Bijela sjajna kuhinja s crnim granitnim otokom",
    style: "minimal",
    shape: "otok",
    studio: { oblik: "otok", front: "lak", top: "crni" },
    files: [f("kuhinja-bijela-otok", 960, 720), f("kuhinja-bijela-granit", 960, 720)],
  },
  {
    id: "sivobez-tamnosiva-sjaj",
    title: "Sivobež i tamnosiva kuhinja visokog sjaja",
    style: "moderna",
    shape: "L",
    files: [f("kuhinja-siva-gloss")],
  },
  {
    // both photos were taken before the wall behind the worktop was finished
    id: "hrast-krem",
    title: "U-kuhinja u hrastu s krem sjajnim gornjim elementima",
    style: "moderna",
    shape: "U",
    studio: { oblik: "U", front: "hrast", top: "hrast" },
    files: [f("kuhinja-drvo-bijela"), f("kuhinja-krem-drvo")],
  },
];

export const projects: Project[] = kitchens.map(({ files, ...k }) => {
  const photos = files.map(({ file, w, h }): Photo => ({
    src: `/galerija/${file}.jpg`,
    w,
    h,
    title: k.title,
    style: k.style,
    shape: k.shape,
    project: k.id,
  }));
  return { ...k, photos, cover: photos[0] };
});

/** every photo, kitchen by kitchen in display order */
export const gallery: Photo[] = projects.flatMap((p) => p.photos);

export const styleLabel: Record<Style, string> = {
  moderna: "Moderna",
  minimal: "Minimalistička",
  premium: "Premium",
  klasicna: "Klasična",
};

/** "kuhinja-siva-mramor": the file name without folder and extension — the `?slika=` value of an inquiry */
export const photoSlug = (photo: Pick<Photo, "src">): string => photo.src.replace(/^.*\//, "").replace(/\.[a-z]+$/i, "");

/** "Želim sličnu kuhinju": the contact form, preset to a kitchen and the photo the customer was looking at */
export const inquiryHref = (photo: Pick<Photo, "src">): string => `/kontakt?interes=kuhinja&slika=${photoSlug(photo)}#upit`;

/** "Složite sličnu u 3D-u" */
export const studioHref = (look: StudioLook): string =>
  `/studio?${new URLSearchParams({ oblik: look.oblik, front: look.front, top: look.top })}`;

/** Croatian plural: 1 kuhinja, 2–4 kuhinje, 5+ kuhinja (21 kuhinja, 22 kuhinje, 12 kuhinja) */
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

export const kitchenCount = (n: number) => `${n} ${plural(n, "kuhinja", "kuhinje", "kuhinja")}`;
export const photoCount = (n: number) => `${n} ${plural(n, "fotografija", "fotografije", "fotografija")}`;
