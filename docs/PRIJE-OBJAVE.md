# Prije objave — što vlasnik mora dati ili potvrditi

Stranica nikad ne izmišlja činjenice. Sve što vlasnik još nije dao stoji kao `null` (ili kao `TODO(vlasnik)` u kodu)
i prikazuje se kroz `<Fill>`:

- **u razvoju** (`npm run dev`) i u produkcijskom buildu s `NEXT_PUBLIC_SHOW_TODO=1` (npr. preview za pregled) vidi se
  isprekidani marker **„upisati: …“** na točnom mjestu gdje podatak nedostaje;
- **u produkciji** se redak bez podatka ne prikazuje. Iznimka je politika privatnosti: dok nedostaju podaci voditelja
  obrade, na `/privatnost` stoji vidljiva napomena, a `next build` u zapisu ispisuje upozorenje `[PRIJE OBJAVE]`.

Zato prije objave prođite cijeli ovaj popis. Najlakše je pokrenuti stranicu s markerima i proći sve stranice:
`/`, `/kuhinje`, `/ormari`, `/interijeri`, `/radovi`, `/o-nama`, `/kontakt`, `/pitanja`, `/privatnost`, `/studio`.

---

## 1. Podaci o tvrtki i kontakt — `lib/site.ts`

Upisuje se samo ono što je točno; ostalo ostaje `null`.

| Polje | Što upisati | Gdje se prikazuje |
|---|---|---|
| [ ] `contact.phone` | broj za prikaz, npr. `+385 91 123 4567` | zaglavlje (široki zasloni), podnožje, kontakt na naslovnici, `/kontakt`, `/privatnost`, poruke u formama i 3D studiju kad slanje ne radi, potvrdni e-mail kupcu, JSON-LD |
| [ ] `contact.whatsapp` | broj u wa.me obliku bez `+`, npr. `385911234567` | plutajući WhatsApp gumb (pojavljuje se tek kad je broj upisan), kontakt na naslovnici, `/kontakt` |
| [ ] `contact.email` | adresa za upite i pitanja o privatnosti | podnožje, naslovnica, `/kontakt` (i rečenica da se fotografije ili tlocrt mogu poslati e-mailom), `/privatnost` (kanal za zahtjeve iz GDPR-a), potvrdni e-mail kupcu, JSON-LD |
| [ ] `contact.address` | ulica i broj radionice / izložbenog prostora | podnožje, naslovnica, `/kontakt`, `/o-nama`, JSON-LD |
| [ ] `contact.city` | grad (stari prototip navodio je „Zagreb“, ali to nije potvrđeno) | podnožje, naslovnica, `/kontakt`, `/o-nama` („Gdje smo“), JSON-LD, podnožje potvrdnog e-maila kupcu |
| [ ] `contact.hours` | radno vrijeme | podnožje, naslovnica, `/kontakt`; u JSON-LD ulazi samo ako je zapisano u schema.org obliku (`Mo-Fr 08:00-16:00`) |
| [ ] `contact.mapUrl` | poveznica na Google Maps | `/kontakt` („Otvori na karti“), JSON-LD |
| [ ] `legal.companyName` | puni naziv, npr. `EMNA Interijeri d.o.o.` | podnožje (stupac „Tvrtka“ i ©), `/o-nama`, `/privatnost` (voditelj obrade), potvrdni e-mail, JSON-LD |
| [ ] `legal.oib` | OIB | podnožje, `/o-nama`, `/privatnost`, JSON-LD |
| [ ] `legal.seat` | sjedište (registrirana adresa) | podnožje, `/o-nama`, `/privatnost` |
| [ ] `legal.registry` | npr. `Trgovački sud u …, MBS …` (d.o.o.) | podnožje, `/o-nama` |
| [ ] `legal.shareCapital` | d.o.o.: iznos temeljnog kapitala i je li uplaćen u cijelosti | `/o-nama` („Podaci o tvrtki“) |
| [ ] `legal.management` | d.o.o.: članovi uprave | `/o-nama` |
| [ ] `legal.bank` | banka i IBAN poslovnog računa | `/o-nama` |
| [ ] `legal.owner` | obrt: ime vlasnika obrta | `/o-nama`, `/privatnost` |
| [ ] `social.instagram`, `social.facebook` | puni URL profila | podnožje, JSON-LD |
| [ ] `facts.projects`, `facts.years` | samo stvarne, potvrđene brojke | naslovnica (manifest), `/o-nama` („Brojke“) |

Polja `shareCapital` i `management` vrijede za d.o.o., a `owner` za obrt; u `registry` ide sudski registar i MBS
(d.o.o.) ili upis u obrtni registar (obrt). Što je točno obvezno ovisi o pravnom obliku (za trgovačka društva ZTD čl. 21);
to neka potvrdi računovođa ili pravnik.

## 2. Cijene u 3D studiju — `lib/studio/catalog.ts`

Sve brojke su **okvirne procjene, nitko ih nije potvrdio**. Kupac ih vidi odmah na `/studio` („Okvirna cijena od … do …“),
a isti raspon ide u e-mail vlasniku i u potvrdu kupcu.

Stanje 25. 10. 2026. (provjerite u datoteci, brojke se mogu mijenjati):

- [ ] **Fronte** (`fronts[].pricePerMeter`, €/m), 34 boje u 5 skupina:
  - Mat lak: Antracit 950, Bijela 900, Krem 920, Kašmir 950, Pijesak 950, Svijetlosiva 930, Tamnosiva 950, Crna 980,
    Maslina 980, Kadulja 980, Tamnozelena 990, Petrolej 990, Noćno plava 990, Terakota 990, Bordo 990.
  - Sjajni lak: Bijeli 1150, Krem 1180, Sivi 1180, Antracit 1180, Crni 1220.
  - Drvo i furnir: Hrast prirodni 1350, Hrast bijeljeni 1380, Hrast dimljeni 1420, Hrast crno bajcan 1450, Orah 1450,
    Jasen 1330, Tik 1520.
  - Kamen i beton (dekor): svijetli beton 1120, tamni beton 1120, bijeli mramor 1240, tamni kamen 1200.
  - Metalik: Bronca 1320, Šampanjac 1320, Titan 1320.
  - Dvobojna kuhinja: svaki dio (donji, gornji, visoki stup, otok) računa se po cijeni svoje fronte.
- [ ] **Radne ploče** (`tops[].pricePerMeter`, €/m): Bijeli mramor 520, Calacatta mramor 690, Carrara mramor 560,
  Nero Marquina 650, Crni kamen 450, Sivi granit 420, Bijeli kvarc 480, Sivi kvarc 500, Sivi beton 380,
  Bijeli kompakt 300, Crni kompakt 330, Hrastova ploča 260, Orahova ploča 340, Inox 600.
- [ ] **Ručke** (`handles[].pricePerMeter`, €/m fronti): bez ručki (profil Gola) 90, metalna letvica 45, okrugli gumb 25,
  utorna ručka 70, otvaranje na dodir 60.
- [ ] **Završne obrade** (`finishes`, doplate): boja ručki / profila — crna i inox 0, mesing 18 €/m fronti; sudoper —
  inox 0, crni ili bijeli granit 140 € po sudoperu; slavina — inox 0, crna mat 60, mesing 120 € po sudoperu;
  postolje — crno 0, u boji donjih fronti 15 €/m, inox 38 €/m; fronte aparata i boja LED svjetla bez doplate.
- [ ] **Elementi i mehanizmi** (`modules[].priceAdd`, € po komadu):
  - donji: tri ladice 220, dvije duboke ladice 170, četiri ladice 290, ladice s unutarnjom ladicom 310, vrata s
    policom 0, dvoja vrata s policom 20, sudoper 380, perilica posuđa 90, izvlačni koš za smeće 240, ploča za kuhanje
    150, ploča i pećnica ispod 260, pećnica ispod radne ploče 220, izvlačni stalak za boce 190, otvorene police 40,
    kutni karusel 420, kutni LeMans 520, kutni Magic corner 640;
  - gornji: gornja vrata 0, klapna 190, dvostruka klapna 290, vitrina 160, otvorena niša 60, zidna polica 40, nosač za
    suđe 110, element za napu 120, ugradbena mikrovalna 160;
  - visoki: hladnjak 350, pećnica u visini očiju 300, pećnica i mikrovalna 420, izvlačna smočnica 650, visoki ormar s
    policama 80, ormar za metle i usisivač 140, perilica rublja 200.
  - Otvoreni elementi plaćaju samo dio cijene fronte po metru (`frontShare`: otvorene police 0,45, zidna polica 0,2),
    a „Slobodno mjesto“ i „Bez gornjeg elementa“ ne plaćaju ništa.
- [ ] **Dodaci** (`extras`): LED 45 €/m + 150 €, dostava i montaža 70 € po metru elemenata, otok 650 € paušalno,
  zidna obloga od materijala radne ploče između ploče i gornjih elemenata (`backsplashShare: 1` = ista cijena po m²
  kao ploča), raspon ±8 % (`spread: 0.08`).
- [ ] Način izračuna (koliki dio cijene fronte ide na donje, gornje i visoke elemente): `lib/studio/price.ts`, `ZONE_FACTOR`.
- [ ] **PDV**: potvrditi da su cijene s PDV-om. Komentar u katalogu to pretpostavlja, ali uz cijenu u studiju i u
  e-mailovima to još ne piše.
- [ ] **Kućanski uređaji**: potvrditi da hladnjak, pećnica, perilica, ploča i napa **nisu** uračunati (uračunata je samo
  njihova ugradnja) i da to piše uz cijenu. Studio nudi „ugradbeni hladnjak i pećnicu“, pa kupac lako pomisli da su
  uređaji u cijeni. Tekst uz cijenu: `components/studio/Price.tsx`; e-mail: `lib/lead-email/`.

Dok cijene nisu potvrđene, bolje je cijenu u studiju ne prikazivati nego objaviti izmišljene brojke.

## 3. Česta pitanja — `components/pages/pitanja/faq.ts`

Odgovori su sada namjerno neutralni. Kad vlasnik potvrdi, odgovor (`a`) se napiše konkretno i obriše se `todo`
(marker „upisati …“ tada nestaje).

- [ ] `izmjera`: je li izmjera besplatna i pod kojim uvjetima.
- [ ] `podrucje`: područje rada (grad, županija, cijela Hrvatska).
- [ ] `ukljuceno`: uključuje li montaža ugradnju uređaja i spajanje sudopera. O tome ovisi i tekst koraka „Montaža“
  na naslovnici (`components/home/Process.tsx`) i u koracima suradnje (`components/pages/ProcessSteps.tsx`): ondje se
  „ključ u ruke“ i „spreman za korištenje“ ne obećavaju dok to nije potvrđeno.
- [ ] `uredaji`: nabavljate li uređaje za kupce.
- [ ] `uzorci`: postoji li izložbeni prostor, donosite li uzorke na izmjeru.
- [ ] `rok`: okvirni rokovi izrade i montaže.
- [ ] `placanje`: uvjeti plaćanja (predujam, rate, načini plaćanja).
- [ ] `jamstvo`: trajanje i uvjeti jamstva.

## 4. Politika privatnosti — `app/(site)/privatnost/page.tsx`

Tekst je **nacrt**. Neka ga prije objave pregleda pravnik ili savjetnik za zaštitu podataka.

- [ ] Podaci voditelja obrade (puni naziv, OIB, sjedište, e-mail, za obrt i vlasnik) dolaze iz `lib/site.ts` (točka 1).
  Dok nedostaju, stranica u produkciji pokazuje vidljivu napomenu, a zahtjevi iz GDPR-a idu na formu za upit.
  Ta forma ne radi dok nije uključeno slanje (točka 6), pa je **e-mail obvezan prije objave**.
- [ ] Rok čuvanja upita bez suradnje: `RETENTION_MONTHS` (sada 12 mjeseci).
- [ ] Naziv pružatelja hostinga (npr. Vercel Inc., SAD) i pružatelja poslovne e-pošte (markeri u točki 4 politike).
- [ ] Mehanizam prijenosa podataka u SAD za svakog izvršitelja (EU–SAD okvir ili standardne ugovorne klauzule).
- [ ] **Privola u formama**: tekst kvačice u formi za upit (`components/forms/ContactForm.tsx`) i u 3D studiju
  (`components/studio/steps/SendStep.tsx`), poruka greške bez kvačice i točka 3 politike (pravna osnova) moraju govoriti
  isto. Sada kvačica traži privolu „radi odgovora na upit“, a politika odgovor na upit temelji na čl. 6. st. 1. t. b,
  a privolu veže samo uz kontakt telefonom ili e-poštom. Odabrati jednu osnovu i uskladiti sva tri mjesta.
- [ ] Datum posljednje izmjene: `UPDATED`.

## 5. Fotografije — `lib/gallery.ts`, `public/galerija/`, `public/og-image.jpg`

- [ ] Potvrditi da su **sve fotografije u `public/galerija/`** (njih 30) vaše realizacije i da ih smijete objaviti.
  Opisi govore samo što je na slici; grad ili klijent se ne navode osim ako to sami želite (`lib/gallery.ts`).
- [ ] Potvrditi sliku za dijeljenje na mrežama `public/og-image.jpg` (i ikone `public/apple-touch-icon.png`, `app/favicon.ico`).
- [ ] `/ormari` i `/interijeri` nemaju fotografija (okvir „Fotografije realizacija uskoro“). Kad ih date, idu u
  `public/` i u podatke stranice; stock ni AI fotografije se ne koriste.

## 6. Slanje upita (Resend), baza, administracija i varijable okruženja — `.env.example`, Vercel

Varijable se upisuju u Vercel (Project → Settings → Environment Variables, Production i Preview), zatim ponovna objava.
Lokalno: kopija `.env.example` u `.env.local`.

Baza i administracija (`/admin`: upiti i ponude):

- [ ] `DATABASE_URL` (i `DATABASE_URL_UNPOOLED` za migracije): Neon Postgres. Postavlja ih Neon integracija u Vercelu.
  Bez baze se upiti ne spremaju (stižu samo e-mailom) i administracija ne radi.
- [ ] Tablice: jednom pokrenuti `npm run db:migrate` nad produkcijskom bazom (migracije su u `drizzle/`).
- [ ] `BLOB_READ_WRITE_TOKEN`: privatni Vercel Blob za slike kuhinja iz studija i datoteke ponuda (neobavezno; bez
  njega se upit sprema bez slike).
- [ ] `ADMIN_SESSION_SECRET`: nasumičan niz od barem 32 znaka (potpisuje prijavu u administraciju).
- [ ] `ADMIN_SETUP_TOKEN`: nasumičan niz od barem 16 znakova. Prvi korisnik se stvara na
  `/admin/postavljanje?kod=<ADMIN_SETUP_TOKEN>`; čim korisnik postoji, ta stranica više ništa ne radi.
- [ ] Ako je baza prije objave služila za probu, provjeriti da u njoj nema probnih upita i ponuda. Brojevi upita i
  ponuda (U-2026-0001, P-2026-0001) idu redom iz tablice `counters`, pa i obrisani probni zapisi „potroše“ prve brojeve.

Slanje e-mailova:

- [ ] `RESEND_API_KEY`: ključ s resend.com (počinje s `re_`).
- [ ] `LEAD_EMAIL_TO`: pretinac(i) za upite, više adresa odvojeno zarezom.
- [ ] `LEAD_EMAIL_FROM`: pošiljatelj na domeni potvrđenoj u Resendu, npr. `EMNA Interijeri <upiti@vasa-domena.hr>`.
- [ ] Dok sve tri nisu postavljene, e-mailovi se ne šalju: upit se samo spremi u bazu i vidi se u `/admin/upiti`
  (kupac ne dobiva potvrdu e-mailom). Tek kad nema ni baze, forme pošteno kažu da online slanje još nije uključeno
  (API odgovara `503 not_configured`). Nakon postavljanja poslati probni upit iz forme na `/kontakt` i iz 3D studija i provjeriti
  da su stigli e-mail vlasniku (sa slikom kuhinje) i potvrda kupcu.
- [ ] `NEXT_PUBLIC_SHOW_TODO`: samo za preview na kojem vlasnik pregledava markere. U produkciji mora biti prazno.

## 7. Domena i `NEXT_PUBLIC_SITE_URL`

- [ ] Kupiti ili spojiti domenu u Vercelu.
- [ ] `NEXT_PUBLIC_SITE_URL=https://vasa-domena.hr` (bez kose crte na kraju). Koristi se za canonical i `og:url`,
  `sitemap.xml`, `robots.txt`, JSON-LD i poveznice u e-mailovima („Otvori kuhinju u 3D“, politika privatnosti).
  Ako je prazno ili neispravno, stranica ne pada nego koristi `https://emna-interijeri.vercel.app`, pa poveznice
  vode na Vercel adresu umjesto na vašu domenu.
- [ ] Domenu potvrditi i u Resendu (za `LEAD_EMAIL_FROM`).

## 8. Završna provjera

- [ ] Produkcijski build bez `NEXT_PUBLIC_SHOW_TODO`: u zapisu buildanja nema upozorenja `[PRIJE OBJAVE]`.
- [ ] `/privatnost` nema napomenu o nepotpunim podacima voditelja obrade.
- [ ] Podnožje ima stupac „Tvrtka“ (naziv, OIB, sjedište), a `/o-nama` blok „Podaci o tvrtki“.
- [ ] Na `/kontakt` su telefon, e-mail i adresa; probni upit stiže.
- [ ] U `lib/studio/catalog.ts` i ostatku koda nema neriješenih `TODO(vlasnik)`
  (`grep -rn "TODO(vlasnik)" app components lib`).
