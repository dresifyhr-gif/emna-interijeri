# EMNA Interijeri — redizajn stranice + 3D studio za kupce (Projekt 1)

Datum: 2026-10-24 · Grana: `redesign-studio`

## Zašto

EMNA radi kuhinje, ormare i interijere po mjeri. Stara stranica je bila vizualni prototip:
izmišljene recenzije i brojke, stock i AI fotke, lažni kontakti, forme koje ništa ne šalju.
Cilj je **ultra premium, luksuzna, dizajnerski i tehnološki vrhunska** stranica čiji je središnji
dio **3D studio**: kupac za dvije minute složi kuhinju po svojim zidovima i pošalje upit s točnim
mjerama, oblikom i materijalima. Studio je kasnije temelj SaaS proizvoda za stolare (Projekt 3),
pa se gradi kao samostalan, podatkovno vođen modul.

Redoslijed: **1. stranica + studio za kupce** (ovaj dokument) → 2. stručni način za stolara nakon izmjere
(kosine, stupovi, priključci, mehanizmi po elementu) → 3. SaaS (računi, katalog po stolaru, pretplata).

## Ciljevi / ne-ciljevi / anti-ciljevi

- Cilj: prvi dojam "ovo nisam nigdje vidio" — živi 3D u heroju, filmsko svjetlo, precizne animacije.
- Cilj: upit koji stiže vlasniku sadrži mjere zidova, oblik, materijale, sliku i link koji otvara tu kuhinju.
- Cilj: sve što se kasnije mijenja (materijali, cijene, tipovi elemenata) je **podatak**, ne ukucano u komponente.
- Ne-cilj (sada): stručni način (kosine, stupovi, priključci), računi, plaćanje, više stolara.
- Anti-cilj: **nikad izmišljene činjenice** — telefon, mail, OIB, brojke projekata, recenzije, gradovi.
  Sve što vlasnik još nije dao ide kroz `lib/site.ts` (`null`) i `<Fill>` marker.
- Anti-cilj: stock (Unsplash) i AI fotke predstavljene kao "naši radovi". Koristimo samo `/public/galerija/*`.
- Anti-cilj: "igračka" izgled. Animacije su teške, smirene, precizne (ease `cubic-bezier(.2,.8,.2,1)`), ne skakutave.

## Vizualni jezik (odluka: Claude)

- **Tamno je potpis** (hero, proces, materijali, studio, podnožje): `ink` #0B0B0C, tekst `fg` #F2EFE9, prigušeno `mut` #8F897E.
- **Svijetli topli "papir"** nosi prave radove, manifest i kontakt: `paper` #EEEAE3, tekst `ink`, prigušeno `mut-paper` #6D675D.
- Jedina naglasna boja: **accent** #C9B99A (na papiru `accent-deep` #8A7A5C).
- Tipografija: **Space Grotesk** (display, velika slova, uska prorednost, `.display` klasa) + **Inter** (tekst). Male oznake: `.eyebrow`.
- Kontejner: `.shell`. Staklo: `.glass`. Animacija pojavljivanja: `<Reveal>`. Gumbi: `<LinkButton>/<Button>` (`components/ui/Button.tsx`).
- Tehnički crtež (tanke accent linije, kote u cm) je motiv koji se ponavlja: "po mjeri" doslovno.
- Poštuj `prefers-reduced-motion`. Mobitel je prvorazredan (studio mora raditi prstom).

## Informacijska arhitektura

Rute u `app/(site)/…` (dobivaju Header/Footer iz `app/(site)/layout.tsx`); `/studio` je izvan grupe (preko cijelog ekrana).

| Ruta | Sadržaj |
|---|---|
| `/` | Hero (živi 3D, skrol ga slaže) → Manifest ("Svaki centimetar je vaš.") → Radovi (prave fotke) → Kako nastaje (izmjera, 3D projekt, izrada, montaža + crtež koji se iscrtava) → Materijali (klik otvara studio s tim materijalom) → Poziv u studio (reflektor) → Kontakt (forma) |
| `/kuhinje` | kuhinje po mjeri: oblici (ravna/L/U/otok), mehanizmi, materijali, radovi kuhinja, CTA studio |
| `/ormari` | ormari po mjeri (bez fotki dok ih vlasnik ne da — tipografija + crteži, ne stock) |
| `/interijeri` | kompletni interijeri, isto pravilo za fotke |
| `/radovi` | galerija svih 30 fotki iz `lib/gallery.ts`, filtri po stilu/obliku, lightbox |
| `/o-nama` | tko smo, kako radimo, vrijednosti; brojke samo iz `site.facts` |
| `/kontakt` | kontakt podaci (Fill), forma upita, karta ako postoji `mapUrl` |
| `/pitanja` | česta pitanja (bez obećanja koja vlasnik nije potvrdio — garancije, rokovi, plaćanje označiti kao TODO) |
| `/privatnost` | politika privatnosti (GDPR: voditelj obrade = podaci iz `site.legal`, svrha: odgovor na upit) |
| `/studio` | 3D konfigurator preko cijelog ekrana; `?k=` parametar učitava podijeljenu konfiguraciju |
| stare rute | `/galerija`→`/radovi`, `/konfigurator`→`/studio`, `/blog` i `/blog/*`→`/pitanja` (301 u `next.config.ts`) |

Plus: `app/sitemap.ts`, `app/robots.ts`, `app/not-found.tsx` (hrvatski, tamno), metadata + canonical po stranici.

## 3D studio (za kupce)

Polazište: radna skica `.superpowers/brainstorm/10038-1792835176/content/studio-3d.html` (Three.js, proceduralna kuhinja,
studijsko svjetlo, bloom, dan/večer, val svjetla pri promjeni materijala, vrata/ladice se otvaraju klikom, kote u cm).
Prenosi se u TypeScript modul i nadograđuje.

Ugovor: `lib/studio/types.ts` (`KitchenConfig`, `ModuleInfo`, `StudioEngineApi`, `createStudioEngine`).

- `lib/studio/engine.ts` — `export const createStudioEngine: CreateStudioEngine`. Vanilla Three.js (bez React-a) da se kasnije
  može ugraditi bilo gdje (SaaS widget). Načini: `studio` (interaktivno) i `showcase` (hero, `setProgress(0..1)` vodi
  slaganje + kruženje kamere + izmjenu materijala; bez klikanja).
- `lib/studio/catalog.ts` — fronte, radne ploče, ručke, tipovi elemenata (mehanizmi), cijene po metru. Podatak, ne kod.
- `lib/studio/price.ts` — `estimate(cfg) → { low, high }` (okvirno, ±).
- `lib/studio/share.ts` — `encodeConfig/decodeConfig` (URL-safe, kratko), validacija i default za nepoznato.
- `lib/studio/summary.ts` — `summarize(cfg) → string[]` čitljive stavke za upit (oblik, svaki zid u cm, strop, prozor, fronta, ploča, ručke, aparati, LED, izmjene elemenata).
- Koraci (kupac): **1 Oblik** (ravna, L, U, s otokom) → **2 Zidovi** (cm po zidu, visina stropa, opcionalno prozor: zid, udaljenost, širina, parapet) →
  **3 Fronte** (materijal + ručke) → **4 Radna ploča** → **5 Dodaci** (visoki stup hladnjak+pećnica, LED, dužina otoka) → **6 Pošalji**.
- Klik na element: popover s opcijama tog mjesta (npr. ladice / vrata / klapna koja se diže / otvorena niša / kutni karusel)
  i animacija mehanizma. Kutovi L/U su pravi kutni elementi; gornji elementi idu oko kuta. Prozor skraćuje/izostavlja gornje elemente ispred sebe.
- Uvijek vidljivo: okvirna cijena (animirani brojač), dan/večer, sažetak.
- Slanje: ime, telefon, e-mail, grad, kada planira, privola (obavezna, link na /privatnost) → `sendLead()` s `config`, `configUrl`
  (apsolutni link `/studio?k=…`), `summary`, `price`, `snapshot` (JPEG iz `engine.snapshot(1200)`).
- Nakon slanja: zahvala + gumb "Kopiraj link na svoju kuhinju".
- Ulaz iz drugih stranica: `/studio?front=hrast` ili `?top=mramor` predodabire materijal.
- Performanse: three.js se učitava samo na `/studio` i u heroju (dinamički import), `devicePixelRatio ≤ 2`, pauza renderiranja kad kartica nije vidljiva / hero nije u kadru.

## Upiti (lead)

- `POST /api/upit` — validacija `lib/lead-schema.ts` (zod), honeypot `website`, jednostavno ograničenje (npr. 5/min po IP-u, u memoriji).
- Slanje maila preko **Resend** ako postoje env varijable `RESEND_API_KEY`, `LEAD_EMAIL_TO`, `LEAD_EMAIL_FROM`.
  Vlasniku: sve stavke, kontakt, link, slika (privitak/inline). Kupcu: potvrda sa sažetkom, slikom i linkom.
- Ako env nije postavljen → `503 { ok:false, error:"not_configured" }`, a sučelje to **pošteno** kaže
  ("Slanje još nije uključeno — nazovite nas / pošaljite mail") — nikad lažni uspjeh.
- `components/forms/ContactForm.tsx` — forma za `/kontakt` i naslovnicu (`source:"kontakt"`).

## Ostala pravila

- Next.js 16.4 App Router (pročitati `node_modules/next/dist/docs/` kad nešto nije sigurno — npr. `params` je Promise).
- Tailwind v3 + tokeni iz `tailwind.config.ts`. Framer Motion za UI animacije.
- Slike: `next/image` za `/public/galerija/*` (sve 4:3, dimenzije u `lib/gallery.ts`). Bez `images.unsplash.com`.
- Nema kolačića za praćenje → nema bannera. (Analitika kasnije, bez kolačića.)
- Hrvatski jezik, ispravna dijakritika, ton: miran, samouvjeren, bez superlativa i bez praznih obećanja.

## Odluke koje je donio Claude (vlasnik ih može promijeniti)

Tamno+papir umjesto potpuno tamnog; Space Grotesk + Inter; vanilla Three.js engine; link na kuhinju bez baze (konfiguracija u URL-u);
Resend za mail; blog članci (filler iz 2025.) uklonjeni, FAQ zadržan kao `/pitanja`; `/galerija` preimenovana u `/radovi`.

## Što vlasnik mora dati prije objave

Telefon, WhatsApp, e-mail i domena, adresa i radno vrijeme, puni naziv tvrtke, OIB, sjedište, MBS, prave brojke,
potvrda da su fotke njihove, potvrda jamstva/rokova/plaćanja u FAQ-u, Resend ključ (ili drugi način slanja maila).
