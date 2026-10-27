/**
 * FAQ for /pitanja, rebuilt from the old blog Q&A.
 *
 * Rules: no promise the owner hasn't confirmed. Where the old page promised specifics
 * (free measuring, delivery times, payment schedule, warranty years, showroom, certificates,
 * service area, appliance brands) the answer is neutral and `todo` names what to confirm —
 * the UI shows it as an "upisati …" marker in development only. `a` is plain text and is
 * also used for the FAQPage JSON-LD.
 */

export type Faq = {
  id: string;
  q: string;
  a: string;
  /** what the owner must confirm before the answer can be made specific */
  todo?: string;
  link?: { href: string; label: string };
};

export type FaqGroup = { id: string; title: string; items: Faq[] };

export const faq: FaqGroup[] = [
  {
    id: "suradnja",
    title: "Suradnja",
    items: [
      {
        id: "tijek",
        q: "Kako izgleda suradnja od prvog kontakta do montaže?",
        a: "Pošaljete upit putem forme ili iz 3D studija. Dogovaramo izmjeru u vašem prostoru i razgovaramo o tome kako ga koristite. Zatim izrađujemo 3D projekt i ponudu te projekt doradimo dok ne bude onakav kakav želite. Nakon potvrde slijedi izrada, a na kraju montaža.",
        link: { href: "/kontakt", label: "Pošaljite upit" },
      },
      {
        id: "izmjera",
        q: "Naplaćuje li se izmjera?",
        a: "Uvjete izmjere i prvog savjetovanja dogovaramo pri prvom razgovoru, prije nego što bilo što naručite.",
        todo: "potvrditi: je li izmjera besplatna / pod kojim uvjetima",
      },
      {
        id: "arhitekt",
        q: "Treba li mi arhitekt ili dizajner interijera?",
        a: "Ne treba. Izmjeru, projekt, izradu i montažu radimo sami. Ako već imate arhitekta ili dizajnera interijera, radimo prema njihovim nacrtima i usklađujemo se s njima.",
      },
      {
        id: "priprema",
        q: "Što trebam pripremiti za prvi razgovor?",
        a: "Korisno je imati tlocrt ili barem mjere zidova i visinu stropa, položaj vrata, prozora i instalacija (voda, struja, plin), nekoliko fotografija prostora iz različitih kutova, primjere kuhinja ili ormara koji vam se sviđaju i okvirni budžet.",
      },
      {
        id: "podrucje",
        q: "Na kojem području radite?",
        a: "Javite nam gdje se prostor nalazi. Područje izmjere i montaže dogovaramo za svaki projekt posebno.",
        todo: "potvrditi područje rada (grad, županija, cijela Hrvatska)",
      },
      {
        id: "poslovni",
        q: "Radite li i poslovne prostore?",
        a: "Opišite nam prostor i što vam treba. Odgovorit ćemo vam možemo li preuzeti projekt i u kojem opsegu.",
      },
    ],
  },
  {
    id: "kuhinje",
    title: "Kuhinje",
    items: [
      {
        id: "oblici",
        q: "Koje oblike kuhinja radite?",
        a: "Ravne, L i U kuhinje te kuhinje s otokom, kao i njihove kombinacije. Raspored ne biramo iz kataloga nego ga crtamo prema zidovima, prozorima i instalacijama u vašem prostoru.",
        link: { href: "/kuhinje", label: "Kuhinje po mjeri" },
      },
      {
        id: "ravna-ili-l",
        q: "Ravna kuhinja ili L-kuhinja?",
        a: "Ravna kuhinja stoji uz jedan zid i dobro odgovara užim prostorima i kuhinjama otvorenima prema dnevnom boravku. L-kuhinja koristi dva susjedna zida, daje više radne površine i pohrane te lakše tvori radni trokut između sudopera, ploče za kuhanje i hladnjaka. U 3D studiju možete isprobati oba oblika na svojim mjerama.",
        link: { href: "/studio", label: "Otvorite 3D studio" },
      },
      {
        id: "otok",
        q: "Koliko prostora treba za otok?",
        a: "Kao orijentir: oko otoka treba ostaviti prolaz od barem 90 cm, a oko 120 cm ako se u kuhinji često mimoilaze dvije osobe. Otok za sjedenje treba biti dublji od radnog. Točan raspored provjeravamo pri izmjeri.",
      },
      {
        id: "ukljuceno",
        q: "Što je uključeno u kuhinju po mjeri?",
        a: "Ovisi o projektu: donji, gornji i visoki elementi, radna ploča, ručke, okovi i mehanizmi, rasvjeta. Što je točno uključeno, uključujući ugradnju uređaja, navodimo u ponudi stavku po stavku.",
        todo: "potvrditi: uključuje li montaža ugradnju uređaja i spajanje sudopera",
      },
      {
        id: "uredaji",
        q: "Kupujem li ugradbene uređaje sam?",
        a: "Možete ih kupiti sami; tada nam na vrijeme pošaljite modele kako bismo im prilagodili elemente. Mogućnost nabave uređaja preko nas dogovaramo u ponudi.",
        todo: "potvrditi: nabavljate li uređaje za kupce",
      },
      {
        id: "mehanizmi",
        q: "Koje mehanizme možete ugraditi?",
        a: "Ladice s punim izvlačenjem i tihim zatvaranjem, klapne gornjih elemenata koje se dižu, okretne i izvlačne police za kutove, izvlačne smočnice i otvaranje na dodir za fronte bez ručki. Biramo ih prema mjestu i načinu korištenja.",
        link: { href: "/kuhinje#mehanizmi", label: "Mehanizmi i okovi" },
      },
      {
        id: "rasvjeta",
        q: "Kakvu rasvjetu planirati u kuhinji?",
        a: "Samo stropno svjetlo obično nije dovoljno. Planirajte rasvjetu ispod gornjih elemenata za radnu ploču, a po potrebi i svjetlo iznad otoka ili blagovaonskog stola. Mjesta za priključke rasvjete određujemo u projektu, prije montaže.",
      },
    ],
  },
  {
    id: "ormari-interijeri",
    title: "Ormari i interijeri",
    items: [
      {
        id: "ormari",
        q: "Radite li ugradbene ormare i garderobe?",
        a: "Da: ugradbene ormare od poda do stropa, ormare u nišama i pod kosinama, garderobe i ormare s kliznim vratima. Unutrašnjost slažemo prema onome što u njih spremate.",
        link: { href: "/ormari", label: "Ormari po mjeri" },
      },
      {
        id: "cijeli-stan",
        q: "Možete li opremiti cijeli stan?",
        a: "Možemo projektirati i izraditi namještaj po mjeri za više prostorija odjednom: kuhinju, hodnik, dnevni boravak, spavaće sobe i radnu sobu, tako da materijali i linije budu usklađeni.",
        link: { href: "/interijeri", label: "Interijeri po mjeri" },
      },
    ],
  },
  {
    id: "materijali",
    title: "Materijali",
    items: [
      {
        id: "fronte",
        q: "Koji su materijali dostupni za fronte?",
        a: "Lakirani MDF u mat ili visokom sjaju, furnir od pravog drva, ploče s dekorom drva, betona ili kamena te staklo. Lak može biti gotovo u bilo kojoj boji, a točne dekore biramo zajedno nakon izmjere.",
      },
      {
        id: "mdf-ili-drvo",
        q: "MDF ili drvo?",
        a: "Lakirani MDF je stabilan, ne radi s vlagom i temperaturom kao drvo, ima savršeno ravnu površinu i dolazi u bilo kojoj boji, pa je prirodan izbor za moderne kuhinje. Masivno drvo i furnir donose toplinu i godove; furnir je dobra sredina jer ima izgled pravog drva na stabilnoj podlozi.",
      },
      {
        id: "radne-ploce",
        q: "Koji materijal odabrati za radnu ploču?",
        a: "Laminat je najpristupačniji. Kompakt ploča je tanka i otporna na vodu. Kvarc je neporozan i otporan na mrlje. Keramika je vrlo tvrda i otporna na toplinu. Prirodni kamen je jedinstven, ali traži impregnaciju. Drvo je toplo, ali najbolje služi dalje od sudopera.",
      },
      {
        id: "uzorci",
        q: "Mogu li vidjeti uzorke prije odluke?",
        a: "Materijale ne biramo samo prema slici na zaslonu. Kako i gdje možete vidjeti uzorke frontova i radnih ploča, dogovaramo pri prvom razgovoru.",
        todo: "potvrditi: postoji li izložbeni prostor / donosite li uzorke na izmjeru",
      },
    ],
  },
  {
    id: "cijene-rokovi",
    title: "Cijene, rokovi i jamstvo",
    items: [
      {
        id: "cijena",
        q: "Koliko košta kuhinja po mjeri?",
        a: "Ovisi o dužini, obliku, materijalima, mehanizmima i uređajima. Okvirni raspon za svoje mjere vidite odmah u 3D studiju, a točnu cijenu daje ponuda nakon izmjere.",
        link: { href: "/studio", label: "Izračunaj okvirnu cijenu" },
      },
      {
        id: "katalog",
        q: "Zašto je kuhinja po mjeri skuplja od kataloške?",
        a: "Kataloška kuhinja slaže se od elemenata standardnih širina, a ostatak zida popunjavaju maske. Kuhinja po mjeri koristi cijeli zid, prati kutove, kosine i instalacije, a materijale i mehanizme birate vi. Razlika u cijeni dolazi upravo od toga.",
      },
      {
        id: "rok",
        q: "Koliko traje izrada i montaža?",
        a: "Rok ovisi o veličini projekta i odabranim materijalima. Točan rok izrade i montaže navodimo u ponudi.",
        todo: "potvrditi okvirne rokove izrade i montaže",
      },
      {
        id: "placanje",
        q: "Kako funkcionira plaćanje?",
        a: "Dinamiku plaćanja dogovaramo u ponudi, prije početka izrade.",
        todo: "potvrditi uvjete plaćanja (predujam, rate, načini plaćanja)",
      },
      {
        id: "jamstvo",
        q: "Postoji li jamstvo?",
        a: "Uvjeti jamstva na izradu i montažu navedeni su u ponudi. Za ugradbene uređaje vrijedi jamstvo njihova proizvođača.",
        todo: "potvrditi trajanje i uvjete jamstva",
      },
    ],
  },
  {
    id: "studio",
    title: "3D studio",
    items: [
      {
        id: "sto-je-studio",
        q: "Što je 3D studio?",
        a: "Alat na našoj stranici u kojem kuhinju složite po svojim mjerama: oblik, zidove, prozor, fronte, radnu ploču i dodatke. Vidite je u 3D-u, otvarate ladice i vrata te odmah dobivate okvirni raspon cijene.",
        link: { href: "/studio", label: "Otvorite 3D studio" },
      },
      {
        id: "studio-cijena",
        q: "Je li cijena iz studija konačna?",
        a: "Nije. Cijena iz studija je okvirna i služi za orijentaciju. Konačnu cijenu dajemo u ponudi nakon izmjere, kad znamo sve detalje prostora.",
      },
      {
        id: "studio-upit",
        q: "Što se događa kad pošaljem kuhinju iz studija?",
        a: "Upit nam stiže s mjerama, odabranim materijalima, slikom i poveznicom koja otvara baš vašu kuhinju. Javit ćemo vam se s pitanjima i prijedlogom izmjere. Poveznicu možete spremiti i kasnije nastaviti.",
      },
    ],
  },
];

export const allFaqs = faq.flatMap((g) => g.items);
