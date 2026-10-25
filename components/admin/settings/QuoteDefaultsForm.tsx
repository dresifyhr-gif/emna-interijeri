"use client";

/**
 * Default values for new quotes: PDV, validity, payment terms and the closing note,
 * with a live preview of the bottom of a quote (on "paper", like the printed document).
 */
import { useActionState, useRef, useState } from "react";
import { Input, Textarea } from "@/components/admin/ui";
import { formatLongDate } from "@/lib/admin/format";
import { ErrorSummary, SaveBar, useResultFocus, useUnsavedWarning } from "./form-bits";
import { IDLE_FORM, type FormState } from "./types";

export interface QuoteDefaultsValues {
  vatPct: string;
  validDays: string;
  terms: string;
  notes: string;
}

const LABELS: Record<keyof QuoteDefaultsValues, string> = {
  vatPct: "PDV",
  validDays: "Rok valjanosti",
  terms: "Uvjeti plaćanja",
  notes: "Napomena na dnu ponude",
};

/** "2026-10-25" + 30 → "2026-11-24" */
function addDays(iso: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !Number.isInteger(days) || days < 1 || days > 365) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, 12));
  return d.toISOString().slice(0, 10);
}

export function QuoteDefaultsForm({
  initial,
  todayIso,
  textMax,
  updatedAt,
  action,
}: {
  initial: QuoteDefaultsValues;
  /** today in Europe/Zagreb, from the server (no hydration mismatch around midnight) */
  todayIso: string;
  textMax: number;
  updatedAt: string | null;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const form = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const [live, setLive] = useState<QuoteDefaultsValues>(initial);

  const source = !state.ok && state.values ? (state.values as unknown as QuoteDefaultsValues) : initial;
  if (seenAt !== state.at) {
    setSeenAt(state.at);
    if (state.ok) setDirty(false);
    setLive(source);
  }
  useResultFocus(state, form);
  useUnsavedWarning(dirty);

  const until = addDays(todayIso, Number(live.validDays.trim()));
  const set = (k: keyof QuoteDefaultsValues) => (e: { currentTarget: { value: string } }) => {
    const v = e.currentTarget.value;
    setLive((s) => ({ ...s, [k]: v }));
  };

  return (
    <form ref={form} action={formAction} onChange={() => setDirty(true)} noValidate className="space-y-6">
      <ErrorSummary state={state} labels={LABELS} />

      <div key={state.at} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <fieldset className="rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5 sm:p-6">
            <legend className="float-left mb-5 w-full">
              <span className="block font-display text-[17px] font-medium tracking-tight text-fg">Iznosi i rokovi</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-mut">
                Upisuju se u svaku novu ponudu; u pojedinoj ponudi možete ih promijeniti.
              </span>
            </legend>
            <div className="clear-both grid gap-5 sm:grid-cols-2">
              <Input
                name="vatPct"
                label="PDV (%)"
                inputMode="decimal"
                maxLength={6}
                defaultValue={source.vatPct}
                onChange={set("vatPct")}
                error={state.errors.vatPct}
                hint="Opća stopa u Hrvatskoj je 25 %. Ako niste u sustavu PDV-a, upišite 0 i u napomenu dodajte propisanu rečenicu."
                autoComplete="off"
              />
              <Input
                name="validDays"
                label="Rok valjanosti (dana)"
                inputMode="numeric"
                maxLength={3}
                defaultValue={source.validDays}
                onChange={set("validDays")}
                error={state.errors.validDays}
                hint={until ? `Ponuda izrađena danas vrijedila bi do ${formatLongDate(until)}` : "Od 1 do 365 dana."}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5 sm:p-6">
            <legend className="float-left mb-5 w-full">
              <span className="block font-display text-[17px] font-medium tracking-tight text-fg">Tekstovi</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-mut">
                Pišite kao kupcu. Prazno polje znači da se taj dio u ponudi ne prikazuje.
              </span>
            </legend>
            <div className="clear-both space-y-5">
              <Textarea
                name="terms"
                label="Uvjeti plaćanja"
                rows={5}
                maxLength={textMax}
                defaultValue={source.terms}
                onChange={set("terms")}
                error={state.errors.terms}
                placeholder={"npr. Predujam … % pri narudžbi, ostatak po završetku montaže.\nPlaćanje na IBAN naveden u zaglavlju ponude."}
              />
              <Textarea
                name="notes"
                label="Napomena na dnu ponude"
                rows={4}
                maxLength={textMax}
                defaultValue={source.notes}
                onChange={set("notes")}
                error={state.errors.notes}
                placeholder="npr. Konačna cijena potvrđuje se nakon izmjere na licu mjesta."
              />
            </div>
          </fieldset>
        </div>

        <aside aria-label="Pregled dna ponude" className="lg:sticky lg:top-24">
          <p className="eyebrow mb-3 text-mut">Pregled — dno ponude</p>
          <div className="rounded-2xl bg-paper p-6 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,.7)]">
            <div className="flex items-baseline justify-between gap-4 border-b border-paper-line pb-3 text-[12.5px]">
              <span className="text-mut-paper">Ukupno s PDV-om ({live.vatPct.trim() || "—"} %)</span>
              <span className="font-display text-[17px] font-medium tabular-nums">— €</span>
            </div>
            <p className="mt-3 text-[12px] text-mut-paper">
              {until ? <>Ponuda vrijedi do {formatLongDate(until)}</> : "Rok valjanosti nije upisan."}
            </p>
            {live.terms.trim() && (
              <div className="mt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent-deep">Uvjeti plaćanja</p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{live.terms.trim()}</p>
              </div>
            )}
            {live.notes.trim() && (
              <p className="mt-4 whitespace-pre-wrap break-words border-t border-paper-line pt-3 text-[12px] leading-relaxed text-mut-paper">
                {live.notes.trim()}
              </p>
            )}
            {!live.terms.trim() && !live.notes.trim() && (
              <p className="mt-4 text-[12px] italic text-mut-paper">Uvjeti i napomena još nisu upisani.</p>
            )}
          </div>
        </aside>
      </div>

      <SaveBar pending={pending} dirty={dirty} state={state} updatedAt={updatedAt} />
    </form>
  );
}
