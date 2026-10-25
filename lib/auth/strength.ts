/**
 * Rough password strength for the setup form's hint (client-safe, no imports).
 * Not a security control — the server only enforces the hard rules in lib/auth/password.ts.
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  level: StrengthLevel;
  label: string;
  hint: string;
}

const COMMON = [
  "password",
  "lozinka",
  "qwertz",
  "qwerty",
  "123456",
  "654321",
  "111111",
  "abc123",
  "admin",
  "emna",
  "kuhinj",
  "zagreb",
  "iloveyou",
  "welcome",
];

const LABELS: Record<StrengthLevel, string> = {
  0: "Prekratka",
  1: "Slaba",
  2: "Osrednja",
  3: "Dobra",
  4: "Odlična",
};

export function passwordStrength(password: string, username = ""): Strength {
  const pw = password.normalize("NFKC");
  if (pw.length < 10) {
    return { level: 0, label: LABELS[0], hint: `Još ${10 - pw.length} ${plural(10 - pw.length)} do najmanje duljine.` };
  }

  const classes = [/[a-zčćđšž]/u, /[A-ZČĆĐŠŽ]/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(pw)).length;
  const unique = new Set(pw).size;
  const lower = pw.toLowerCase();

  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (pw.length >= 20) score++;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (unique < pw.length / 3) score -= 2;
  if (/(.)\1{2,}/u.test(pw)) score--;
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) score--;
  if (COMMON.some((w) => lower.includes(w))) score -= 2;
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) score -= 2;

  const level = Math.max(1, Math.min(4, score)) as StrengthLevel;
  const hint =
    level >= 4
      ? "Odlično. Spremite je u upravitelj lozinki."
      : level === 3
        ? "Dobro. Dulja fraza od nekoliko riječi bila bi još bolja."
        : "Dodajte duljinu — npr. 4–5 nepovezanih riječi s razmacima ili brojkom.";
  return { level, label: LABELS[level], hint };
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "znak";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "znaka";
  return "znakova";
}
