/**
 * Legends for the numbered callouts in the drawings. Kept out of the "use client"
 * drawing modules so server pages can map over them.
 */

/** Callouts 01–07 in <WardrobeElevation annotated /> */
export const wardrobeCallouts = [
  { n: "01", title: "Gornji spremnik", text: "Prostor do stropa za sezonske stvari, kofere i posteljinu." },
  { n: "02", title: "LED rasvjeta", text: "Svjetlo uz gornju policu ili u profilu vrata, s uključivanjem pri otvaranju." },
  { n: "03", title: "Šipka za vješanje", text: "Visina prema duljini odjeće: kaputi i haljine trebaju više mjesta od košulja." },
  { n: "04", title: "Police", text: "Razmak polica prilagođavamo onome što na njih slažete." },
  { n: "05", title: "Ladice", text: "Puno izvlačenje i tiho zatvaranje, s pregradama za sitnice." },
  { n: "06", title: "Cipelarnik", text: "Kose ili izvlačne police za obuću, uz dno ormara." },
  { n: "07", title: "Vrata", text: "Krilna, klizna ili bez ručki; ravna, lakirana ili u furniru." },
] as const;

/** Items numbered on the plan; the page lists them next to the drawing. */
export const planCallouts = [
  { n: "01", title: "Kuhinja s otokom" },
  { n: "02", title: "TV zid i police" },
  { n: "03", title: "Ormar u spavaćoj sobi" },
  { n: "04", title: "Ulazni ormar" },
  { n: "05", title: "Radni stol i police" },
] as const;
