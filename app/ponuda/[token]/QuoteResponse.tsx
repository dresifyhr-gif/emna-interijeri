"use client";

/**
 * The customer's answer on /ponuda/<token>: accept (name + confirmation) or reject (name + optional
 * reason). Posts JSON to /api/ponuda/<token>; the page re-renders with the stored answer.
 * Also sends the one-time "opened" beacon (link previews of chat apps don't run scripts).
 */
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, formatLongDate } from "@/lib/admin/format";

type Mode = "idle" | "accept" | "reject";

const ERRORS: Record<string, string> = {
  validation: "Provjerite upisane podatke.",
  rate_limited: "Previše pokušaja. Pričekajte nekoliko minuta pa pokušajte ponovno.",
  expired: "Rok valjanosti ove ponude je istekao, pa je više nije moguće prihvatiti.",
  already: "Na ovu ponudu je već odgovoreno.",
  not_sent: "Ova ponuda trenutno nije otvorena za odgovor.",
  not_found: "Ponuda nije pronađena.",
  preview: "U pregledu iz administracije odgovor je isključen.",
  forbidden: "Zahtjev nije dopušten. Osvježite stranicu i pokušajte ponovno.",
};

export function ViewBeacon({ token }: { token: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/ponuda/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "view" }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }, [token]);
  return null;
}

export function QuoteResponse({
  token,
  number,
  totalCents,
  validUntil,
  canRespond,
  preview,
}: {
  token: string;
  number: string;
  totalCents: number;
  validUntil: string | null;
  /** status "poslana" and still valid */
  canRespond: boolean;
  /** opened by the logged-in owner: show, but don't allow answering */
  preview: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "idle") nameRef.current?.focus();
  }, [mode]);

  if (!canRespond) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 3) {
      setFieldError("Upišite svoje ime i prezime.");
      nameRef.current?.focus();
      return;
    }
    if (mode === "accept" && !agree) {
      setError("Za prihvaćanje potvrdite da ste pročitali ponudu i uvjete.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/ponuda/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          mode === "accept" ? { action: "accept", name: n, confirm: true } : { action: "reject", name: n, reason: reason.trim() || undefined },
        ),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) {
        router.refresh();
        return;
      }
      setError(ERRORS[body?.error ?? ""] ?? "Odgovor nije spremljen. Pokušajte ponovno za minutu.");
      if (body?.error === "already" || body?.error === "expired") router.refresh();
    } catch {
      setError("Veza nije uspjela. Provjerite internet i pokušajte ponovno.");
    } finally {
      setBusy(false);
    }
  };

  const id = (s: string) => `${uid}-${s}`;
  const field =
    "block h-12 w-full rounded-xl border border-white/12 bg-ink-800 px-4 text-[15px] text-fg placeholder:text-mut/70 transition-colors hover:border-white/25 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40";
  const primary =
    "inline-flex h-12 items-center justify-center rounded-full bg-accent px-7 text-[14px] font-semibold tracking-wide text-ink transition-colors duration-200 hover:bg-fg disabled:opacity-50";
  const secondary =
    "inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-7 text-[14px] font-semibold tracking-wide text-fg transition-colors duration-200 hover:border-accent/60 hover:text-accent disabled:opacity-50";

  return (
    <section aria-labelledby={id("h")} className="glass rounded-3xl p-6 sm:p-8">
      <p className="eyebrow mb-3 flex items-center gap-3 text-accent">
        <span aria-hidden className="h-px w-6 bg-accent/70" />
        Vaš odgovor
      </p>
      <h2 id={id("h")} className="font-display text-[24px] font-medium leading-tight tracking-tight sm:text-[28px]">
        Odgovara li vam ponuda {number}?
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-fg/70">
        Ukupno <span className="font-medium text-fg">{formatCents(totalCents)}</span> s PDV-om
        {validUntil ? `, vrijedi do ${formatLongDate(validUntil)}` : ""}. Odgovor stiže izravno nama.
      </p>

      {preview && (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-fg/75">
          Ovo je pregled iz administracije — gumbi za odgovor ovdje su isključeni.
        </p>
      )}

      {mode === "idle" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={preview} onClick={() => setMode("accept")}>
            Prihvaćam ponudu
          </button>
          <button type="button" className={secondary} disabled={preview} onClick={() => setMode("reject")}>
            Odbijam ponudu
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={id("name")} className="text-[13px] font-medium text-fg/85">
              Ime i prezime
            </label>
            <input
              ref={nameRef}
              id={id("name")}
              name="name"
              className={field}
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? id("name-err") : id("name-hint")}
            />
            {fieldError ? (
              <p id={id("name-err")} className="text-[13px] text-rose-300">
                {fieldError}
              </p>
            ) : (
              <p id={id("name-hint")} className="text-[12.5px] text-mut">
                {mode === "accept" ? "Osoba koja prihvaća ponudu." : "Osoba koja odgovara na ponudu."}
              </p>
            )}
          </div>

          {mode === "accept" ? (
            <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-fg/85">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#C9B99A]"
              />
              Pročitao/la sam ponudu {number} i prihvaćam stavke, cijenu i uvjete navedene u njoj.
            </label>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={id("reason")} className="text-[13px] font-medium text-fg/85">
                Razlog <span className="font-normal text-mut">(nije obavezno)</span>
              </label>
              <textarea
                id={id("reason")}
                name="reason"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${field} h-auto min-h-[96px] py-3 leading-relaxed`}
                placeholder="Npr. cijena, rok, želim izmjenu…"
              />
            </div>
          )}

          <div role="alert" aria-live="assertive" className="empty:hidden">
            {error && <p className="rounded-xl border border-rose-300/25 bg-rose-400/[0.07] px-4 py-3 text-[13.5px] text-rose-100">{error}</p>}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className={mode === "accept" ? primary : secondary} disabled={busy || preview} aria-busy={busy || undefined}>
              {busy ? "Šaljem…" : mode === "accept" ? "Potvrđujem prihvaćanje" : "Odbij ponudu"}
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center px-3 text-[14px] font-medium text-fg/60 transition-colors hover:text-fg"
              onClick={() => {
                setMode("idle");
                setError(null);
                setFieldError(null);
              }}
            >
              Natrag
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
