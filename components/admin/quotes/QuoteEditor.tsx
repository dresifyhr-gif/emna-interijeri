"use client";

/**
 * Quote editor: customer, quote settings, editable line items with live totals, notes and terms.
 * Saves through the `saveAction` server action (create when `quoteId` is null, then navigates to the
 * new quote). Number fields are text inputs so "1,5" and "1.234,56" work as typed in Croatia.
 *
 * `sidebar` renders next to the form (status, share, links); client parts of it can read the
 * unsaved-changes state with useQuoteEditorState() to refuse sending stale data.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardHeader, Input, Textarea, cx } from "@/components/admin/ui";
import { formatCents } from "@/lib/admin/format";
import { lineTotalCents, parseEurToCents, quoteTotals } from "@/lib/admin/quote-math";
import { isValidEmail } from "@/lib/lead-client";
import { IconArrowDown, IconArrowUp, IconCopy, IconPlus, IconTrash } from "./icons";
import {
  QUOTE_LIMITS,
  UNIT_SUGGESTIONS,
  centsToInput,
  formatPct,
  isIsoDay,
  isValidOib,
  numberToInput,
  parseDecimal,
  type QuoteFieldErrors,
  type QuoteFormValues,
  type QuoteItem,
  type SaveQuoteResult,
} from "./model";

/* ================================================================== shared state */

interface EditorState {
  /** unsaved changes in the form */
  dirty: boolean;
  saving: boolean;
}

const EditorContext = createContext<EditorState>({ dirty: false, saving: false });

/** for sidebar widgets: don't send / change status while the form has unsaved changes */
export const useQuoteEditorState = () => useContext(EditorContext);

/* ================================================================== rows */

interface Row {
  key: string;
  description: string;
  details: string;
  showDetails: boolean;
  qty: string;
  unit: string;
  price: string;
  discount: string;
}

type RowField = "description" | "qty" | "unit" | "price" | "discount" | "details";

const newKey = () => globalThis.crypto.randomUUID();

function rowFromItem(it: QuoteItem): Row {
  return {
    key: it.id || newKey(),
    description: it.description ?? "",
    details: it.details ?? "",
    showDetails: Boolean(it.details),
    qty: numberToInput(it.qty),
    unit: it.unit ?? "",
    price: centsToInput(it.unit_price_cents),
    discount: it.discount_pct ? numberToInput(it.discount_pct) : "",
  };
}

const blankRow = (): Row => ({ key: newKey(), description: "", details: "", showDetails: false, qty: "1", unit: "kom", price: "", discount: "" });

/** parsed line + per-field problems (empty price = 0 €, empty discount = 0 %) */
function parseRow(r: Row): { item: QuoteItem; errors: Partial<Record<RowField, string>> } {
  const errors: Partial<Record<RowField, string>> = {};
  const qty = parseDecimal(r.qty);
  if (qty === null) errors.qty = r.qty.trim() ? "Količina nije broj." : "Upišite količinu.";
  else if (qty < 0 || qty > QUOTE_LIMITS.qtyMax) errors.qty = "Količina nije u dopuštenom rasponu.";
  const cents = r.price.trim() ? parseEurToCents(r.price) : 0;
  if (cents === null) errors.price = "Cijena nije ispravna (npr. 1.234,50).";
  else if (cents < 0 || cents > QUOTE_LIMITS.unitPriceMaxCents) errors.price = "Cijena nije u dopuštenom rasponu.";
  const disc = r.discount.trim() ? parseDecimal(r.discount) : 0;
  if (disc === null || disc < 0 || disc > 100) errors.discount = "Popust je između 0 i 100.";
  const blank = !r.description.trim() && !r.details.trim() && !cents;
  if (!blank && !r.description.trim()) errors.description = "Upišite opis stavke.";
  return {
    item: {
      id: r.key,
      description: r.description.trim(),
      ...(r.details.trim() ? { details: r.details.trim() } : {}),
      qty: qty !== null && qty >= 0 ? qty : 0,
      unit: r.unit.trim(),
      unit_price_cents: cents !== null && cents >= 0 ? cents : 0,
      discount_pct: disc !== null && disc >= 0 && disc <= 100 ? disc : 0,
    },
    errors,
  };
}

const ROW_ERROR_FIELD: Record<string, RowField> = {
  description: "description",
  details: "details",
  qty: "qty",
  unit: "unit",
  unit_price_cents: "price",
  discount_pct: "discount",
};

/* ================================================================== form state */

interface FormState {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerOib: string;
  title: string;
  discount: string;
  vat: string;
  validUntil: string;
  notes: string;
  terms: string;
  rows: Row[];
}

function stateFrom(v: QuoteFormValues): FormState {
  return {
    customerName: v.customerName,
    customerEmail: v.customerEmail,
    customerPhone: v.customerPhone,
    customerAddress: v.customerAddress,
    customerOib: v.customerOib,
    title: v.title,
    discount: v.discountPct ? numberToInput(v.discountPct) : "",
    vat: numberToInput(v.vatPct),
    validUntil: v.validUntil,
    notes: v.notes,
    terms: v.terms,
    rows: v.items.length ? v.items.map(rowFromItem) : [blankRow()],
  };
}

/** comparable snapshot for the "unsaved changes" flag (ignores the details toggle) */
const fingerprint = (s: FormState) =>
  JSON.stringify({ ...s, rows: s.rows.map((r) => [r.key, r.description, r.details, r.qty, r.unit, r.price, r.discount]) });

function collect(s: FormState): { values: QuoteFormValues; errors: QuoteFieldErrors } {
  const errors: QuoteFieldErrors = {};
  if (!s.customerName.trim()) errors.customerName = "Upišite ime i prezime ili naziv kupca.";
  const email = s.customerEmail.trim();
  if (email && !isValidEmail(email)) errors.customerEmail = "E-mail adresa nije ispravna.";
  const oib = s.customerOib.trim();
  if (oib && !isValidOib(oib)) errors.customerOib = "OIB nije ispravan (11 znamenki s ispravnim kontrolnim brojem).";
  if (s.validUntil && !isIsoDay(s.validUntil)) errors.validUntil = "Datum nije ispravan.";
  const discount = s.discount.trim() ? parseDecimal(s.discount) : 0;
  if (discount === null || discount < 0 || discount > 100) errors.discountPct = "Popust je između 0 i 100 %.";
  const vat = parseDecimal(s.vat);
  if (vat === null || vat < 0 || vat > 100) errors.vatPct = "PDV je između 0 i 100 %.";

  const items: QuoteItem[] = [];
  for (const r of s.rows) {
    const { item, errors: rowErrors } = parseRow(r);
    for (const [field, msg] of Object.entries(rowErrors)) errors[`item:${r.key}:${field}`] = msg;
    items.push(item);
  }
  return {
    values: {
      customerName: s.customerName,
      customerEmail: email,
      customerPhone: s.customerPhone,
      customerAddress: s.customerAddress,
      customerOib: oib,
      title: s.title,
      items,
      discountPct: discount ?? 0,
      vatPct: vat ?? 0,
      validUntil: s.validUntil,
      notes: s.notes,
      terms: s.terms,
    },
    errors,
  };
}

/** server keys use the item field names (unit_price_cents …), the form uses short ones (price …) */
function normaliseServerErrors(errors: QuoteFieldErrors | undefined): QuoteFieldErrors {
  const out: QuoteFieldErrors = {};
  for (const [k, msg] of Object.entries(errors ?? {})) {
    const m = /^item:(.+):([a-z_]+)$/.exec(k);
    out[m ? `item:${m[1]}:${ROW_ERROR_FIELD[m[2]] ?? m[2]}` : k] = msg;
  }
  return out;
}

/* ================================================================== component */

export interface SaveQuotePayload {
  id: string | null;
  leadId: string | null;
  version: string | null;
  values: QuoteFormValues;
}

const timeFmt = new Intl.DateTimeFormat("hr-HR", { hour: "2-digit", minute: "2-digit" });

export function QuoteEditor({
  quoteId,
  leadId = null,
  version: initialVersion,
  initial,
  saveAction,
  notice,
  sidebar,
}: {
  /** null: a new quote, created on the first save */
  quoteId: string | null;
  leadId?: string | null;
  version: string | null;
  initial: QuoteFormValues;
  saveAction: (payload: SaveQuotePayload) => Promise<SaveQuoteResult>;
  /** shown above the form (e.g. "prefilled from the 3D studio") */
  notice?: ReactNode;
  sidebar?: ReactNode;
}) {
  const router = useRouter();
  const uid = useId();
  const [state, setState] = useState<FormState>(() => stateFrom(initial));
  const [baseline, setBaseline] = useState(() => fingerprint(stateFrom(initial)));
  const [version, setVersion] = useState(initialVersion);
  const [lastVersionProp, setLastVersionProp] = useState(initialVersion);
  const [errors, setErrors] = useState<QuoteFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, startSaving] = useTransition();
  const focusRef = useRef<string | null>(null);

  // a newer version from the server (e.g. after a status change on this page) becomes the base for the next save
  if (initialVersion !== lastVersionProp) {
    setLastVersionProp(initialVersion);
    setVersion(initialVersion);
  }

  const dirty = fingerprint(state) !== baseline;

  /* ---------------- derived */
  const parsed = useMemo(() => state.rows.map((r) => parseRow(r).item), [state.rows]);
  const discountPct = (state.discount.trim() ? parseDecimal(state.discount) : 0) ?? 0;
  const vatPct = parseDecimal(state.vat) ?? 0;
  const totals = quoteTotals(parsed, Math.min(100, Math.max(0, discountPct)), Math.min(100, Math.max(0, vatPct)));

  /* ---------------- updates */
  const fieldErrorKey = (k: keyof FormState): string => (k === "discount" ? "discountPct" : k === "vat" ? "vatPct" : k);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    const ek = fieldErrorKey(key);
    if (errors[ek]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== ek)));
  };

  const updateRow = (key: string, patch: Partial<Row>) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
    const touched = Object.keys(patch);
    if (touched.some((f) => errors[`item:${key}:${f}`])) {
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !touched.some((f) => k === `item:${key}:${f}`))));
    }
  };

  const focusLater = (selector: string) => {
    focusRef.current = selector;
  };
  useEffect(() => {
    if (!focusRef.current) return;
    const el = document.querySelector<HTMLElement>(focusRef.current);
    focusRef.current = null;
    el?.focus();
  });

  const addRow = () => {
    const row = blankRow();
    setState((s) => ({ ...s, rows: [...s.rows, row] }));
    focusLater(`[data-row="${row.key}"] [data-field="description"]`);
  };
  const removeRow = (key: string) => {
    setState((s) => {
      const i = s.rows.findIndex((r) => r.key === key);
      const rows = s.rows.filter((r) => r.key !== key);
      const next = rows[Math.min(i, rows.length - 1)];
      focusLater(next ? `[data-row="${next.key}"] [data-act="remove"]` : `[data-act="add-row"]`);
      return { ...s, rows };
    });
  };
  const duplicateRow = (key: string) => {
    setState((s) => {
      const i = s.rows.findIndex((r) => r.key === key);
      if (i < 0) return s;
      const copy = { ...s.rows[i], key: newKey() };
      focusLater(`[data-row="${copy.key}"] [data-field="description"]`);
      return { ...s, rows: [...s.rows.slice(0, i + 1), copy, ...s.rows.slice(i + 1)] };
    });
  };
  const moveRow = (key: string, dir: -1 | 1) => {
    setState((s) => {
      const i = s.rows.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.rows.length) return s;
      const rows = [...s.rows];
      [rows[i], rows[j]] = [rows[j], rows[i]];
      focusLater(`[data-row="${key}"] [data-act="${dir < 0 ? "up" : "down"}"]`);
      return { ...s, rows };
    });
  };

  /* ---------------- save */
  const save = useCallback(() => {
    if (saving) return;
    const { values, errors: found } = collect(state);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Provjerite označena polja.");
      const first = Object.keys(found)[0];
      const m = /^item:(.+):(\w+)$/.exec(first);
      focusLater(m ? `[data-row="${m[1]}"] [data-field="${m[2]}"]` : `#${CSS.escape(`${uid}-${first}`)}`);
      return;
    }
    const snapshot = fingerprint(state);
    startSaving(async () => {
      let res: SaveQuoteResult;
      try {
        res = await saveAction({ id: quoteId, leadId, version, values });
      } catch {
        setFormError("Spremanje nije uspjelo — provjerite vezu i pokušajte ponovno.");
        return;
      }
      if (res.ok) {
        setErrors({});
        setFormError(null);
        setConflict(false);
        setVersion(res.version);
        setBaseline(snapshot);
        setSavedAt(new Date());
        if (!quoteId) router.replace(`/admin/ponude/${res.id}`);
      } else {
        setErrors(normaliseServerErrors(res.fieldErrors));
        setFormError(res.error);
        setConflict(Boolean(res.conflict));
      }
    });
  }, [leadId, quoteId, router, saveAction, saving, state, uid, version]);

  // ⌘S / Ctrl+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // closing the tab with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const id = (name: string) => `${uid}-${name}`;
  const err = (name: string) => errors[name] ?? null;
  const ctx = useMemo(() => ({ dirty, saving }), [dirty, saving]);

  /* ---------------- render */
  return (
    <EditorContext.Provider value={ctx}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <form
          className="min-w-0 space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          aria-describedby={formError ? id("form-error") : undefined}
        >
          {notice}
          {formError && (
            <div id={id("form-error")}>
              <Alert tone="danger" title={conflict ? "Ponuda nije spremljena." : formError === "Provjerite označena polja." ? undefined : "Ponuda nije spremljena."}>
                {formError}
                {conflict && (
                  <span className="mt-2 block">
                    <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                      Osvježi stranicu
                    </Button>
                  </span>
                )}
              </Alert>
            </div>
          )}

          {/* ---------------- customer */}
          <Card aria-labelledby={id("h-kupac")}>
            <CardHeader id={id("h-kupac")} title="Kupac" description="Podaci koji se ispisuju na ponudi." />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                id={id("customerName")}
                name="customerName"
                label="Ime i prezime ili naziv"
                required
                maxLength={QUOTE_LIMITS.customerName}
                autoComplete="off"
                value={state.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                error={err("customerName")}
              />
              <Input
                id={id("customerEmail")}
                name="customerEmail"
                type="email"
                label="E-mail"
                maxLength={QUOTE_LIMITS.email}
                autoComplete="off"
                value={state.customerEmail}
                onChange={(e) => set("customerEmail", e.target.value)}
                error={err("customerEmail")}
                hint="Na ovu adresu šaljete poveznicu na ponudu."
              />
              <Input
                id={id("customerPhone")}
                name="customerPhone"
                type="tel"
                label="Telefon"
                maxLength={QUOTE_LIMITS.phone}
                autoComplete="off"
                value={state.customerPhone}
                onChange={(e) => set("customerPhone", e.target.value)}
                error={err("customerPhone")}
              />
              <Input
                id={id("customerOib")}
                name="customerOib"
                label="OIB"
                inputMode="numeric"
                maxLength={11}
                autoComplete="off"
                value={state.customerOib}
                onChange={(e) => set("customerOib", e.target.value.replace(/\s/g, ""))}
                error={err("customerOib")}
                hint="Samo ako ga kupac traži (npr. tvrtka za R1)."
              />
              <Textarea
                id={id("customerAddress")}
                name="customerAddress"
                label="Adresa"
                rows={2}
                maxLength={QUOTE_LIMITS.address}
                value={state.customerAddress}
                onChange={(e) => set("customerAddress", e.target.value)}
                error={err("customerAddress")}
                fieldClassName="md:col-span-2"
              />
            </div>
          </Card>

          {/* ---------------- quote settings */}
          <Card aria-labelledby={id("h-ponuda")}>
            <CardHeader id={id("h-ponuda")} title="Ponuda" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_170px_110px_110px]">
              <Input
                id={id("title")}
                name="title"
                label="Naslov"
                maxLength={QUOTE_LIMITS.title}
                placeholder="npr. Kuhinja po mjeri – kuhinja u obliku slova L"
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                error={err("title")}
              />
              <Input
                id={id("validUntil")}
                name="validUntil"
                type="date"
                label="Vrijedi do"
                value={state.validUntil}
                onChange={(e) => set("validUntil", e.target.value)}
                error={err("validUntil")}
              />
              <Input
                id={id("vatPct")}
                name="vat"
                label="PDV %"
                inputMode="decimal"
                maxLength={6}
                value={state.vat}
                onChange={(e) => set("vat", e.target.value)}
                error={err(fieldErrorKey("vat"))}
              />
              <Input
                id={id("discountPct")}
                name="discount"
                label="Popust %"
                inputMode="decimal"
                maxLength={6}
                placeholder="0"
                value={state.discount}
                onChange={(e) => set("discount", e.target.value)}
                error={err(fieldErrorKey("discount"))}
                hint="Na cijelu ponudu."
              />
            </div>
          </Card>

          {/* ---------------- items */}
          <Card aria-labelledby={id("h-stavke")} padding="none">
            <div className="p-5 pb-0 sm:p-6 sm:pb-0">
              <CardHeader
                id={id("h-stavke")}
                title="Stavke"
                description="Jedinične cijene upisujete bez PDV-a; PDV se obračunava na kraju."
                className="mb-4"
              />
              {err("items") && (
                <Alert tone="danger" className="mb-4">
                  {err("items")}
                </Alert>
              )}
            </div>

            <div
              aria-hidden
              className="hidden grid-cols-[28px_minmax(0,1fr)_76px_84px_116px_70px_112px_118px] gap-3 border-y border-white/[0.06] bg-white/[0.02] px-6 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-mut lg:grid"
            >
              <span>#</span>
              <span>Opis</span>
              <span className="text-right">Kol.</span>
              <span>Jed.</span>
              <span className="text-right">Cijena €</span>
              <span className="text-right">Pop. %</span>
              <span className="text-right">Iznos</span>
              <span className="sr-only">Radnje</span>
            </div>

            <datalist id={id("units")}>
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>

            <ol className="divide-y divide-white/[0.05]">
              {state.rows.map((r, i) => {
                const n = i + 1;
                const e = (f: RowField) => errors[`item:${r.key}:${f}`] ?? null;
                const rid = (f: string) => id(`r-${r.key}-${f}`);
                const lineTotal = lineTotalCents(parsed[i] ?? { qty: 0, unit_price_cents: 0, discount_pct: 0 });
                const control =
                  "block w-full rounded-lg border bg-ink-800 px-3 text-[13.5px] text-fg placeholder:text-mut/60 transition-colors hover:border-white/20 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40";
                const state_ = (f: RowField) => (e(f) ? "border-rose-400/60" : "border-white/10");
                const labelCls = "mb-1 block text-[11.5px] font-medium text-fg/70 lg:sr-only";
                const describedBy = (f: RowField) => (e(f) ? rid(`${f}-err`) : undefined);
                return (
                  <li key={r.key} data-row={r.key} className="px-4 py-4 sm:px-6">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[28px_minmax(0,1fr)_76px_84px_116px_70px_112px_118px] lg:items-start">
                      <span className="col-span-2 font-display text-[12px] tabular-nums text-accent/80 sm:col-span-4 lg:col-span-1 lg:pt-2.5">
                        <span className="sr-only">Stavka </span>
                        {String(n).padStart(2, "0")}
                      </span>

                      <div className="col-span-2 sm:col-span-4 lg:col-span-1">
                        <label htmlFor={rid("description")} className={labelCls}>
                          Opis<span className="sr-only"> stavke {n}</span>
                        </label>
                        <input
                          id={rid("description")}
                          data-field="description"
                          className={cx(control, state_("description"), "h-10")}
                          value={r.description}
                          maxLength={QUOTE_LIMITS.description}
                          placeholder="Opis stavke"
                          aria-invalid={e("description") ? true : undefined}
                          aria-describedby={describedBy("description")}
                          onChange={(ev) => updateRow(r.key, { description: ev.target.value })}
                        />
                        {e("description") && (
                          <p id={rid("description-err")} className="mt-1 text-[12px] text-rose-300">
                            {e("description")}
                          </p>
                        )}
                        {r.showDetails || r.details ? (
                          <div className="mt-2">
                            <label htmlFor={rid("details")} className="sr-only">
                              Dodatni opis stavke {n}
                            </label>
                            <textarea
                              id={rid("details")}
                              data-field="details"
                              rows={2}
                              className={cx(control, state_("details"), "min-h-[60px] py-2 text-[12.5px] leading-snug text-fg/80")}
                              value={r.details}
                              maxLength={QUOTE_LIMITS.details}
                              placeholder="Dodatni opis (mjere, materijal, napomena …)"
                              onChange={(ev) => updateRow(r.key, { details: ev.target.value })}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-1.5 text-[12px] font-medium text-mut transition-colors hover:text-accent"
                            onClick={() => {
                              updateRow(r.key, { showDetails: true });
                              focusLater(`[data-row="${r.key}"] [data-field="details"]`);
                            }}
                          >
                            + Dodatni opis<span className="sr-only"> za stavku {n}</span>
                          </button>
                        )}
                      </div>

                      <div>
                        <label htmlFor={rid("qty")} className={labelCls}>
                          Količina<span className="sr-only"> stavke {n}</span>
                        </label>
                        <input
                          id={rid("qty")}
                          data-field="qty"
                          inputMode="decimal"
                          className={cx(control, state_("qty"), "h-10 text-right tabular-nums")}
                          value={r.qty}
                          maxLength={12}
                          aria-invalid={e("qty") ? true : undefined}
                          aria-describedby={describedBy("qty")}
                          onChange={(ev) => updateRow(r.key, { qty: ev.target.value })}
                        />
                      </div>

                      <div>
                        <label htmlFor={rid("unit")} className={labelCls}>
                          Jedinica<span className="sr-only"> stavke {n}</span>
                        </label>
                        <input
                          id={rid("unit")}
                          data-field="unit"
                          list={id("units")}
                          className={cx(control, state_("unit"), "h-10")}
                          value={r.unit}
                          maxLength={QUOTE_LIMITS.unit}
                          onChange={(ev) => updateRow(r.key, { unit: ev.target.value })}
                        />
                      </div>

                      <div>
                        <label htmlFor={rid("price")} className={labelCls}>
                          Cijena € bez PDV-a<span className="sr-only"> stavke {n}</span>
                        </label>
                        <input
                          id={rid("price")}
                          data-field="price"
                          inputMode="decimal"
                          className={cx(control, state_("price"), "h-10 text-right tabular-nums")}
                          value={r.price}
                          maxLength={16}
                          placeholder="0,00"
                          aria-invalid={e("price") ? true : undefined}
                          aria-describedby={describedBy("price")}
                          onChange={(ev) => updateRow(r.key, { price: ev.target.value })}
                          onBlur={() => {
                            const c = parseEurToCents(r.price);
                            if (c !== null && r.price.trim()) updateRow(r.key, { price: centsToInput(c) });
                          }}
                        />
                      </div>

                      <div>
                        <label htmlFor={rid("discount")} className={labelCls}>
                          Popust %<span className="sr-only"> stavke {n}</span>
                        </label>
                        <input
                          id={rid("discount")}
                          data-field="discount"
                          inputMode="decimal"
                          className={cx(control, state_("discount"), "h-10 text-right tabular-nums")}
                          value={r.discount}
                          maxLength={6}
                          placeholder="0"
                          aria-invalid={e("discount") ? true : undefined}
                          aria-describedby={describedBy("discount")}
                          onChange={(ev) => updateRow(r.key, { discount: ev.target.value })}
                        />
                      </div>

                      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-4 lg:col-span-1 lg:block lg:pt-2.5 lg:text-right">
                        <span className="text-[11.5px] font-medium text-fg/70 lg:sr-only">Iznos</span>
                        <span className="font-medium tabular-nums text-fg" aria-live="off">
                          {formatCents(lineTotal)}
                        </span>
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-0.5 sm:col-span-4 lg:col-span-1 lg:pt-1">
                        <RowButton label={`Pomakni stavku ${n} gore`} act="up" disabled={i === 0} onClick={() => moveRow(r.key, -1)}>
                          <IconArrowUp />
                        </RowButton>
                        <RowButton
                          label={`Pomakni stavku ${n} dolje`}
                          act="down"
                          disabled={i === state.rows.length - 1}
                          onClick={() => moveRow(r.key, 1)}
                        >
                          <IconArrowDown />
                        </RowButton>
                        <RowButton
                          label={`Kopiraj stavku ${n}`}
                          act="copy"
                          disabled={state.rows.length >= QUOTE_LIMITS.items}
                          onClick={() => duplicateRow(r.key)}
                        >
                          <IconCopy />
                        </RowButton>
                        <RowButton label={`Ukloni stavku ${n}`} act="remove" danger onClick={() => removeRow(r.key)}>
                          <IconTrash />
                        </RowButton>
                      </div>
                    </div>
                    {(["qty", "price", "discount", "unit", "details"] as const).map((f) =>
                      e(f) ? (
                        <p key={f} id={rid(`${f}-err`)} className="mt-2 text-[12px] text-rose-300 lg:pl-[40px]">
                          {e(f)}
                        </p>
                      ) : null,
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-col gap-6 border-t border-white/[0.06] p-5 sm:p-6 md:flex-row md:items-start md:justify-between">
              <Button
                variant="secondary"
                size="sm"
                icon={<IconPlus />}
                onClick={addRow}
                disabled={state.rows.length >= QUOTE_LIMITS.items}
                data-act="add-row"
              >
                Dodaj stavku
              </Button>

              <dl className="w-full max-w-[340px] self-end text-[13.5px]" aria-label="Iznosi ponude">
                <TotalRow label={totals.discountCents ? "Zbroj stavki" : "Osnovica (bez PDV-a)"} value={formatCents(totals.subtotalCents)} />
                {totals.discountCents !== 0 && (
                  <>
                    <TotalRow label={`Popust ${formatPct(discountPct)}`} value={`−${formatCents(totals.discountCents)}`} />
                    <TotalRow label="Osnovica (bez PDV-a)" value={formatCents(totals.netCents)} />
                  </>
                )}
                <TotalRow label={`PDV ${formatPct(vatPct)}`} value={formatCents(totals.vatCents)} />
                <div className="mt-2 flex items-baseline justify-between gap-6 border-t border-white/10 pt-3">
                  <dt className="eyebrow text-mut">Ukupno</dt>
                  <dd className="font-display text-[26px] font-medium leading-none tracking-tight text-fg tabular-nums">
                    {formatCents(totals.totalCents)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          {/* ---------------- notes */}
          <Card aria-labelledby={id("h-napomene")}>
            <CardHeader id={id("h-napomene")} title="Napomena i uvjeti" description="Oboje se ispisuje na ponudi i vidi ga kupac." />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Textarea
                id={id("notes")}
                name="notes"
                label="Napomena"
                rows={5}
                maxLength={QUOTE_LIMITS.notes}
                value={state.notes}
                onChange={(e) => set("notes", e.target.value)}
                error={err("notes")}
              />
              <Textarea
                id={id("terms")}
                name="terms"
                label="Uvjeti"
                rows={5}
                maxLength={QUOTE_LIMITS.terms}
                value={state.terms}
                onChange={(e) => set("terms", e.target.value)}
                error={err("terms")}
                hint="Npr. način plaćanja, rok izrade, jamstvo — upišite samo ono što stvarno vrijedi."
              />
            </div>
          </Card>

          {/* ---------------- save bar */}
          <div className="sticky bottom-3 z-20">
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-2xl sm:px-5">
              <p className="text-[13px] text-fg/80" role="status" aria-live="polite">
                {saving ? (
                  "Spremam…"
                ) : dirty ? (
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                    Nespremljene promjene
                  </span>
                ) : savedAt ? (
                  `Spremljeno u ${timeFmt.format(savedAt)}`
                ) : quoteId ? (
                  "Sve je spremljeno."
                ) : (
                  "Ponuda još nije spremljena."
                )}
              </p>
              <div className="flex items-center gap-3">
                <span className="hidden text-[12px] text-mut sm:inline">
                  Ukupno <span className="font-medium tabular-nums text-fg">{formatCents(totals.totalCents)}</span>
                </span>
                <Button type="submit" loading={saving} disabled={!dirty && Boolean(quoteId)}>
                  {quoteId ? "Spremi" : "Spremi nacrt"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        {sidebar && <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">{sidebar}</aside>}
      </div>
    </EditorContext.Provider>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-1">
      <dt className="text-mut">{label}</dt>
      <dd className="tabular-nums text-fg/90">{value}</dd>
    </div>
  );
}

function RowButton({
  label,
  act,
  danger = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  act: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-act={act}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-full text-fg/55 transition-colors disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:bg-rose-400/10 hover:text-rose-300" : "hover:bg-white/[0.06] hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
