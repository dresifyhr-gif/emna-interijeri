/**
 * Real EMNA installation photos in /public/galerija (all 4:3).
 * Captions describe what is in the photo only — no invented locations or clients.
 * TODO(vlasnik): potvrditi da su sve fotke vaše realizacije; dodati grad ako želite.
 */

export type Shape = "ravna" | "L" | "U" | "otok";
export type Style = "moderna" | "minimal" | "premium" | "klasicna";

export interface Photo {
  src: string;
  w: number;
  h: number;
  title: string;
  style: Style;
  shape?: Shape;
}

const p = (file: string, title: string, style: Style, shape?: Shape, w = 1400, h = 1050): Photo => ({
  src: `/galerija/${file}.jpg`,
  w,
  h,
  title,
  style,
  shape,
});

export const gallery: Photo[] = [
  p("kuhinja-crna-drvo-otok", "Crna kuhinja s drvenim otokom", "premium", "otok"),
  p("kuhinja-zelena-crni-mramor-2", "Zelena kuhinja s crnim mramornim zidom", "premium", "U"),
  p("kuhinja-bijela-drvo-velik", "Velika bijela kuhinja s otokom i drvom", "premium", "otok"),
  p("kuhinja-siva-mramor", "Antracit kuhinja s mramornom pločom", "premium"),
  p("kuhinja-tamna-drvo-l", "Tamna L-kuhinja s drvenim gornjim elementima", "moderna", "L", 1200, 900),
  p("kuhinja-krem-drvo", "Krem kuhinja s drvenim detaljima", "moderna"),
  p("kuhinja-bijela-zlato", "Bijela kuhinja s otokom i zlatnim detaljima", "premium", "otok"),
  p("kuhinja-zelena-drvo", "Tamnozelena kuhinja s drvenim detaljima", "moderna", undefined, 1024, 768),
  p("kuhinja-drvo-bijela", "L-kuhinja u drvu i bijeloj", "moderna", "L"),
  p("kuhinja-beton-mramor", "Beton dekor s mramornim zidom", "moderna"),
  p("kuhinja-bijela-otok", "Bijela kuhinja s crnim otokom", "minimal", "otok", 960, 720),
  p("kuhinja-mint-drvo", "Mint kuhinja s drvenim gornjim elementima", "moderna"),
  p("kuhinja-bijela-gloss", "Bijeli visoki sjaj s drvenom pozadinom", "minimal"),
  p("kuhinja-zelena-drvo-2", "Zelena kuhinja s toplim drvenim tonovima", "moderna"),
  p("kuhinja-siva-mramor-2", "Siva kuhinja s mramornim zidom", "premium"),
  p("kuhinja-drvo-bijela-2", "L-kuhinja u drvu i bijeloj", "moderna", "L"),
  p("kuhinja-bijela-granit", "Bijela kuhinja s crnom granitnom pločom", "minimal", undefined, 960, 720),
  p("kuhinja-bijela-crna-otok", "Bijela kuhinja s crnim otokom", "premium", "otok"),
  p("kuhinja-crna-mramor-2", "Crna kuhinja i mramorni pod", "premium"),
  p("kuhinja-crna-bijela-otok", "Crna kuhinja s bijelim otokom", "premium", "otok"),
  p("kuhinja-zelena-crni-mramor", "Tamnozelena kuhinja s crnim mramorom", "premium"),
  p("kuhinja-beton-mramor-2", "Beton dekor s mramornom pločom", "moderna"),
  p("kuhinja-siva-mozaik", "Siva kuhinja s mozaik pločicama", "moderna"),
  p("kuhinja-crna-drvo-sala", "Crna kuhinja s drvenim blagovaonskim dijelom", "moderna"),
  p("kuhinja-bijela-klasicna", "Bijela klasična kuhinja s uzorkastim pločicama", "klasicna"),
  p("kuhinja-bijela-klasicna-2", "Bijela klasična L-kuhinja s visokim elementom", "klasicna", "L"),
  p("kuhinja-smedja-crna", "Smeđa kuhinja s crnim zidom", "moderna"),
  p("kuhinja-siva-gloss", "Siva kuhinja visokog sjaja s crnim detaljima", "moderna"),
  p("kuhinja-bijela-gloss-2", "Bijeli visoki sjaj s drvenom pozadinom", "minimal", undefined, 1200, 900),
  p("kuhinja-bijela-drvo-2", "Bijela kuhinja s drvenom pozadinom", "minimal"),
];

export const styleLabel: Record<Style, string> = {
  moderna: "Moderna",
  minimal: "Minimalistička",
  premium: "Premium",
  klasicna: "Klasična",
};
