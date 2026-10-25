/**
 * Labels, hints and input settings for the "Podaci o tvrtki" form (client-safe).
 * Field names are "<group>.<key>" and match CompanySettings in lib/admin/settings.ts, which is
 * also where every value is validated.
 */
import type { CompanyGroup, CompanySettings } from "@/lib/admin/settings";

export interface CompanyFieldMeta {
  /** "contact.phone" */
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  autoComplete?: string;
  maxLength: number;
  multiline?: boolean;
  /** spans both columns */
  wide?: boolean;
}

export interface CompanySection {
  group: CompanyGroup;
  title: string;
  description: string;
  fields: CompanyFieldMeta[];
}

type Keys<G extends CompanyGroup> = keyof CompanySettings[G] & string;
const f = <G extends CompanyGroup>(group: G, key: Keys<G>, meta: Omit<CompanyFieldMeta, "name">): CompanyFieldMeta => ({
  name: `${group}.${key}`,
  ...meta,
});

export const COMPANY_SECTIONS: CompanySection[] = [
  {
    group: "contact",
    title: "Kontakt",
    description: "Kako vas kupci mogu dobiti: zaglavlje i podnožje stranice, stranica Kontakt i svaka ponuda.",
    fields: [
      f("contact", "phone", {
        label: "Telefon",
        placeholder: "+385 91 123 4567",
        hint: "Upišite ga onako kako želite da se prikazuje.",
        type: "tel",
        inputMode: "tel",
        autoComplete: "tel",
        maxLength: 40,
      }),
      f("contact", "whatsapp", {
        label: "WhatsApp",
        placeholder: "+385 91 123 4567",
        hint: "Mobitel na kojem imate WhatsApp. Spremamo ga kao 385911234567 (oblik za poveznicu).",
        type: "tel",
        inputMode: "tel",
        maxLength: 40,
      }),
      f("contact", "email", {
        label: "E-mail",
        placeholder: "info@vasa-domena.hr",
        type: "email",
        inputMode: "email",
        autoComplete: "email",
        maxLength: 200,
      }),
      f("contact", "city", {
        label: "Grad",
        placeholder: "Grad radionice ili izložbenog prostora",
        hint: "Na stranici se prikazuje kao „Grad, Hrvatska“.",
        autoComplete: "address-level2",
        maxLength: 80,
      }),
      f("contact", "address", {
        label: "Adresa radionice / izložbenog prostora",
        placeholder: "Ulica i kućni broj, poštanski broj i mjesto",
        autoComplete: "street-address",
        maxLength: 200,
        wide: true,
      }),
      f("contact", "hours", {
        label: "Radno vrijeme",
        placeholder: "pon–pet 8–16 h, sub 9–13 h",
        hint: "Može i u više redaka.",
        maxLength: 200,
        multiline: true,
      }),
      f("contact", "mapUrl", {
        label: "Poveznica na Google karte",
        placeholder: "https://maps.app.goo.gl/…",
        hint: "U Google kartama: Podijeli → Kopiraj vezu.",
        type: "url",
        inputMode: "url",
        maxLength: 1000,
      }),
    ],
  },
  {
    group: "legal",
    title: "Pravni podaci",
    description:
      "Zakonski obavezni podaci za impresum, politiku privatnosti i ponude. Ispunite ono što vrijedi za vaš oblik: d.o.o. ili obrt.",
    fields: [
      f("legal", "companyName", {
        label: "Puni naziv tvrtke ili obrta",
        placeholder: "Točno kako piše u registru",
        autoComplete: "organization",
        maxLength: 160,
        wide: true,
      }),
      f("legal", "oib", {
        label: "OIB",
        placeholder: "11 znamenki",
        hint: "Provjeravamo kontrolnu znamenku.",
        inputMode: "numeric",
        maxLength: 20,
      }),
      f("legal", "seat", {
        label: "Sjedište",
        placeholder: "Adresa upisana u registar",
        hint: "Može se razlikovati od adrese radionice.",
        maxLength: 200,
      }),
      f("legal", "registry", {
        label: "Upis u registar",
        placeholder: "Trgovački sud u …, MBS …",
        hint: "d.o.o.: sud i MBS. Obrt: obrtni registar i MBO.",
        maxLength: 300,
        wide: true,
      }),
      f("legal", "shareCapital", {
        label: "Temeljni kapital",
        placeholder: "npr. 2.500,00 €, uplaćen u cijelosti",
        hint: "Samo za d.o.o.",
        maxLength: 160,
      }),
      f("legal", "management", {
        label: "Uprava",
        placeholder: "Ime Prezime, direktor",
        hint: "Samo za d.o.o.",
        maxLength: 300,
      }),
      f("legal", "owner", {
        label: "Vlasnik obrta",
        placeholder: "Ime Prezime",
        hint: "Samo za obrt.",
        autoComplete: "name",
        maxLength: 160,
      }),
      f("legal", "bank", {
        label: "Banka i IBAN",
        placeholder: "Naziv banke, HR00 0000 0000 0000 0000 0",
        hint: "IBAN provjeravamo kontrolnim brojem.",
        maxLength: 200,
      }),
    ],
  },
  {
    group: "social",
    title: "Društvene mreže",
    description: "Poveznice u podnožju stranice. Prazno polje znači da se ikona ne prikazuje.",
    fields: [
      f("social", "instagram", {
        label: "Instagram",
        placeholder: "@korisnicko.ime ili poveznica",
        maxLength: 500,
      }),
      f("social", "facebook", {
        label: "Facebook",
        placeholder: "Poveznica na stranicu",
        type: "url",
        inputMode: "url",
        maxLength: 500,
      }),
    ],
  },
  {
    group: "facts",
    title: "Brojke",
    description: "Samo stvarne, provjerljive brojke — prikazuju se na naslovnici i na stranici O nama. Prazno se ne prikazuje.",
    fields: [
      f("facts", "projects", {
        label: "Izvedenih projekata",
        placeholder: "npr. 600+",
        maxLength: 20,
      }),
      f("facts", "years", {
        label: "Godina iskustva",
        placeholder: "npr. 18",
        inputMode: "numeric",
        maxLength: 20,
      }),
    ],
  },
];

/** CompanySettings → { "contact.phone": "…" } for the form's default values */
export function companyToFormValues(c: CompanySettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of COMPANY_SECTIONS) {
    const group = c[section.group] as Record<string, string | null>;
    for (const field of section.fields) {
      const key = field.name.slice(section.group.length + 1);
      out[field.name] = group?.[key] ?? "";
    }
  }
  return out;
}
