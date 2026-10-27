"use client";

/**
 * Sidebar widgets of a quote: status (with the customer's timeline), sharing (link, copy, e-mail /
 * mailto, WhatsApp, the phone's share sheet), duplicate / delete forms and the print button. They refuse
 * to act while the editor has unsaved changes (useQuoteEditorState), so the customer never gets a link
 * to stale content.
 */
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Alert, Button, Card, CardHeader, QuoteStatusBadge, SubmitButton, buttonClass, cx } from "@/components/admin/ui";
import { IconChat } from "@/components/admin/leads/icons";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_OPTIONS } from "@/lib/admin/status";
import { quoteText, toWhatsappDigits, whatsappHref } from "@/lib/admin/whatsapp-text";
import { IconCheck, IconCopy, IconDuplicate, IconLink, IconMail, IconPrint, IconTrash } from "./icons";
import { useQuoteEditorState } from "./QuoteEditor";
import type { QuoteActionResult, QuoteStatus } from "./model";

type Feedback = { tone: "success" | "danger" | "info"; text: string } | null;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {feedback && (
        <Alert tone={feedback.tone} className="mt-4">
          {feedback.text}
        </Alert>
      )}
    </div>
  );
}

/** a button that asks once more before doing something consequential */
export function ConfirmButton({
  children,
  confirmLabel,
  question,
  onConfirm,
  variant = "secondary",
  disabled,
  loading,
  icon,
  className,
}: {
  children: ReactNode;
  confirmLabel: string;
  question: string;
  onConfirm: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant={variant} size="sm" icon={icon} disabled={disabled} loading={loading} className={className} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3" role="group" aria-label={question}>
      <p className="text-[12.5px] leading-snug text-fg/85">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={variant === "ghost" ? "secondary" : variant}
          size="sm"
          autoFocus
          loading={loading}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
          Odustani
        </Button>
      </div>
    </div>
  );
}

/* ================================================================== status */

export interface QuoteTimeline {
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  validUntil: string | null;
}

export function QuoteStatusPanel({
  quoteId,
  status,
  timeline,
  changeStatus,
}: {
  quoteId: string;
  /** effective status */
  status: QuoteStatus;
  timeline: QuoteTimeline;
  changeStatus: (id: string, status: QuoteStatus) => Promise<QuoteActionResult>;
}) {
  const { dirty } = useQuoteEditorState();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [manual, setManual] = useState<QuoteStatus>(status);
  const [shownStatus, setShownStatus] = useState(status);
  // the status changed on the server (this panel or the customer): reset the manual picker
  if (shownStatus !== status) {
    setShownStatus(status);
    setManual(status);
  }

  const run = (next: QuoteStatus) =>
    start(async () => {
      setFeedback(null);
      try {
        const res = await changeStatus(quoteId, next);
        setFeedback(res.ok ? { tone: "success", text: res.message ?? "Status je promijenjen." } : { tone: "danger", text: res.error });
      } catch {
        setFeedback({ tone: "danger", text: "Status nije promijenjen — provjerite vezu i pokušajte ponovno." });
      }
    });

  const blocked = dirty || pending;
  const events: Array<[string, string | null]> = [
    ["Izrađena", timeline.createdAt],
    ["Poslana kupcu", timeline.sentAt],
    ["Kupac je otvorio", timeline.viewedAt],
    ["Prihvaćena", timeline.acceptedAt],
    ["Odbijena", timeline.rejectedAt],
  ];

  return (
    <Card padding="sm" aria-labelledby="ponuda-status">
      <CardHeader id="ponuda-status" title="Status" className="mb-3" action={<QuoteStatusBadge status={status} />} />

      <ol className="space-y-2 border-l border-white/[0.08] pl-4 text-[12.5px]">
        {events
          .filter(([, at]) => at)
          .map(([label, at]) => (
            <li key={label} className="relative">
              <span aria-hidden className="absolute -left-[19px] top-[6px] h-1.5 w-1.5 rounded-full bg-accent/80" />
              <span className="text-fg/85">{label}</span>
              <span className="block text-mut">{formatDateTime(at)}</span>
            </li>
          ))}
        {timeline.validUntil && (
          <li className="relative">
            <span aria-hidden className="absolute -left-[19px] top-[6px] h-1.5 w-1.5 rounded-full border border-white/30" />
            <span className="text-fg/85">{status === "istekla" ? "Istekla" : "Vrijedi do"}</span>
            <span className="block text-mut">{formatDate(timeline.validUntil)}</span>
          </li>
        )}
      </ol>

      {dirty && <p className="mt-4 text-[12.5px] text-amber-200/90">Spremite promjene prije promjene statusa.</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "nacrt" && (
          <Button size="sm" variant="secondary" disabled={blocked} loading={pending} onClick={() => run("poslana")}>
            Označi kao poslanu
          </Button>
        )}
        {status === "poslana" && (
          <>
            <ConfirmButton
              question="Označiti ponudu kao prihvaćenu? Upit prelazi u „Prihvaćeno”, a ponuda se zaključava."
              confirmLabel="Da, prihvaćena"
              disabled={blocked}
              onConfirm={() => run("prihvacena")}
            >
              Kupac je prihvatio
            </ConfirmButton>
            <ConfirmButton
              question="Označiti ponudu kao odbijenu? Upit prelazi u „Odbijeno”."
              confirmLabel="Da, odbijena"
              variant="danger"
              disabled={blocked}
              onConfirm={() => run("odbijena")}
            >
              Kupac je odbio
            </ConfirmButton>
          </>
        )}
        {status === "istekla" && (
          <Button size="sm" variant="secondary" disabled={blocked} loading={pending} onClick={() => run("poslana")}>
            Ponovno označi kao poslanu
          </Button>
        )}
        {(status === "poslana" || status === "istekla") && (
          <Button size="sm" variant="ghost" disabled={blocked} onClick={() => run("nacrt")}>
            Vrati u nacrt
          </Button>
        )}
        {(status === "prihvacena" || status === "odbijena") && (
          <ConfirmButton
            question="Poništiti odgovor kupca i vratiti ponudu u „Poslana”? Kupac će ponovno moći odgovoriti."
            confirmLabel="Da, vrati u poslane"
            variant="ghost"
            disabled={blocked}
            onConfirm={() => run("poslana")}
          >
            Poništi odgovor
          </ConfirmButton>
        )}
      </div>

      <details className="group mt-4 border-t border-white/[0.06] pt-3">
        <summary className="cursor-pointer select-none text-[12.5px] font-medium text-mut transition-colors hover:text-fg">
          Ručna promjena statusa
        </summary>
        <div className="mt-3 flex gap-2">
          <label htmlFor="ponuda-status-select" className="sr-only">
            Novi status
          </label>
          <select
            id="ponuda-status-select"
            value={manual}
            onChange={(e) => setManual(e.target.value as QuoteStatus)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 text-[13px] text-fg focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
          >
            {QUOTE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" disabled={blocked || manual === status} onClick={() => run(manual)}>
            Primijeni
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-mut">
          „{QUOTE_STATUS_LABEL.prihvacena}” i „{QUOTE_STATUS_LABEL.odbijena}” pomiču i povezani upit.
        </p>
      </details>

      <FeedbackLine feedback={feedback} />
    </Card>
  );
}

/* ================================================================== share */

/** the system share icon (a box with an arrow out), drawn like ./icons */
function IconShare() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M7 9.5H5.5A1.5 1.5 0 0 0 4 11v4.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5H13" />
    </svg>
  );
}

const noSubscribe = () => () => {};
/** the browser has a system share sheet (phones, Safari) — false on the server and while hydrating */
const useCanShare = () => useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

export function QuoteSharePanel({
  quoteId,
  status,
  publicUrl,
  customerEmail,
  customerPhone = null,
  customerName = null,
  quoteNumber = "",
  mailtoHref,
  emailEnabled,
  sendEmail,
  changeStatus,
}: {
  quoteId: string;
  status: QuoteStatus;
  publicUrl: string;
  customerEmail: string | null;
  /** with a usable number, "Pošaljite WhatsAppom" opens a chat with the link */
  customerPhone?: string | null;
  customerName?: string | null;
  /** "P-2026-0003", for the message */
  quoteNumber?: string;
  /** prepared mailto: link (subject + body with the link), or null without a customer e-mail */
  mailtoHref: string | null;
  /** Resend is configured on the server */
  emailEnabled: boolean;
  sendEmail: (id: string) => Promise<QuoteActionResult>;
  changeStatus: (id: string, status: QuoteStatus) => Promise<QuoteActionResult>;
}) {
  const { dirty } = useQuoteEditorState();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();
  const isDraft = status === "nacrt";
  const answered = status === "prihvacena" || status === "odbijena";
  const blocked = dirty || pending;
  const waDigits = toWhatsappDigits(customerPhone);
  const waLink = waDigits ? whatsappHref(waDigits, quoteText({ name: customerName, number: quoteNumber, url: publicUrl })) : null;

  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      return true;
    } catch {
      const input = document.getElementById("ponuda-link") as HTMLInputElement | null;
      input?.select();
      setFeedback({ tone: "info", text: "Kopiranje nije dopušteno u ovom pregledniku — link je označen, kopirajte ga ručno (Ctrl/⌘ + C)." });
      return false;
    }
  };

  const markSentAndCopy = () => {
    // copy inside the click (browsers require a user gesture), then mark as sent
    void copy().then((ok) =>
      start(async () => {
        try {
          const res = await changeStatus(quoteId, "poslana");
          setFeedback(
            res.ok
              ? { tone: "success", text: ok ? "Ponuda je označena kao poslana, a link je kopiran." : "Ponuda je označena kao poslana." }
              : { tone: "danger", text: `${ok ? "Link je kopiran, ali ponuda nije označena kao poslana: " : ""}${res.error}` },
          );
        } catch {
          setFeedback({ tone: "danger", text: "Ponuda nije označena kao poslana — provjerite vezu." });
        }
      }),
    );
  };

  /** a draft goes out by message: mark it as sent (the customer's link works only then), like markSentAndCopy */
  const markSent = (done: string) =>
    start(async () => {
      try {
        const res = await changeStatus(quoteId, "poslana");
        setFeedback(res.ok ? { tone: "success", text: done } : { tone: "danger", text: `Ponuda nije označena kao poslana: ${res.error}` });
      } catch {
        setFeedback({ tone: "danger", text: "Ponuda nije označena kao poslana — provjerite vezu." });
      }
    });

  // the link opens WhatsApp inside the click; the status change runs alongside
  const onWhatsapp = () => {
    setFeedback(null);
    if (isDraft) markSent("Ponuda je označena kao poslana — dovršite slanje u WhatsAppu.");
  };

  const share = async () => {
    setFeedback(null);
    try {
      // inside the click (browsers require a user gesture); the share sheet adds the link after the text
      await navigator.share({ title: `Ponuda ${quoteNumber}`.trim(), text: quoteText({ name: customerName, number: quoteNumber }), url: publicUrl });
    } catch (err) {
      // closing the share sheet is not an error, and nothing was sent
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFeedback({ tone: "danger", text: "Dijeljenje nije uspjelo — kopirajte link i pošaljite ga porukom." });
      return;
    }
    if (isDraft) markSent("Ponuda je označena kao poslana.");
  };

  const send = () =>
    start(async () => {
      setFeedback(null);
      try {
        const res = await sendEmail(quoteId);
        setFeedback(res.ok ? { tone: "success", text: res.message ?? "E-mail je poslan." } : { tone: "danger", text: res.error });
      } catch {
        setFeedback({ tone: "danger", text: "E-mail nije poslan — provjerite vezu i pokušajte ponovno." });
      }
    });

  return (
    <Card padding="sm" aria-labelledby="ponuda-dijeljenje">
      <CardHeader
        id="ponuda-dijeljenje"
        title="Kupcu"
        description={
          isDraft
            ? "Kupac može otvoriti poveznicu tek kad ponudu označite kao poslanu."
            : answered
              ? "Kupac je odgovorio; na poveznici vidi ponudu i svoj odgovor."
              : "Kupac na poveznici vidi ponudu, može je ispisati i prihvatiti ili odbiti."
        }
        className="mb-3"
      />

      <label htmlFor="ponuda-link" className="mb-1.5 block text-[12px] font-medium text-fg/70">
        Poveznica na ponudu
      </label>
      <div className="flex gap-2">
        <input
          id="ponuda-link"
          readOnly
          value={publicUrl}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(
            "h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 text-[12px] text-fg/80 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40",
            isDraft && "opacity-60",
          )}
        />
        <Button size="sm" variant="secondary" onClick={() => void copy()} icon={copied ? <IconCheck /> : <IconCopy />} aria-live="polite">
          {copied ? "Kopirano" : "Kopiraj"}
        </Button>
      </div>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-mut transition-colors hover:text-accent"
      >
        <IconLink size={14} />
        Pregledaj kao kupac
        <span className="sr-only">(nova kartica; vaša posjeta se ne bilježi)</span>
      </a>

      {dirty && !answered && <p className="mt-4 text-[12.5px] text-amber-200/90">Spremite promjene prije slanja kupcu.</p>}

      {!answered && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          {emailEnabled ? (
            customerEmail ? (
              <ConfirmButton
                question={`Poslati poveznicu na ponudu na ${customerEmail}?${isDraft ? " Ponuda će se označiti kao poslana." : ""}`}
                confirmLabel="Pošalji"
                variant="primary"
                icon={<IconMail />}
                disabled={blocked}
                loading={pending}
                onConfirm={send}
              >
                {status === "poslana" ? "Pošalji ponovno e-mailom" : "Pošalji kupcu e-mailom"}
              </ConfirmButton>
            ) : (
              <p className="text-[12.5px] text-mut">Upišite e-mail kupca i spremite ponudu da biste je poslali e-mailom.</p>
            )
          ) : (
            <>
              {isDraft && (
                <Button size="sm" variant="primary" icon={<IconCopy />} disabled={blocked} loading={pending} onClick={markSentAndCopy}>
                  Označi kao poslanu i kopiraj link
                </Button>
              )}
              {mailtoHref ? (
                <a
                  href={mailtoHref}
                  className={buttonClass("secondary", "sm", blocked ? "pointer-events-none opacity-50" : undefined)}
                  aria-disabled={blocked || undefined}
                >
                  <IconMail />
                  Napiši e-mail kupcu
                </a>
              ) : null}
            </>
          )}

          {/* by message from the phone: the chat opens with the text and the link; a draft is marked as sent alongside */}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWhatsapp}
              className={buttonClass("secondary", "sm", blocked ? "pointer-events-none opacity-50" : undefined)}
              aria-disabled={blocked || undefined}
            >
              <IconChat size={14} />
              Pošaljite WhatsAppom
              <span className="sr-only">(nova kartica, s pripremljenom porukom i poveznicom)</span>
            </a>
          )}
          {canShare && (
            <Button size="sm" variant="secondary" icon={<IconShare />} disabled={blocked} onClick={() => void share()}>
              Podijeli…
            </Button>
          )}

          {!emailEnabled && (
            <>
              <p className="w-full text-[12px] leading-snug text-mut">
                {mailtoHref
                  ? "E-mail otvara vaš program za e-poštu s pripremljenom porukom i poveznicom. Izravno slanje iz administracije uključuje se kad se postavi Resend."
                  : waLink
                    ? "Bez e-maila kupca poveznicu pošaljite WhatsAppom ili je kopirajte u SMS. Izravno slanje e-mailom uključuje se kad se postavi Resend."
                    : "Bez e-maila kupca poveznicu pošaljite porukom (WhatsApp, SMS). Izravno slanje e-mailom uključuje se kad se postavi Resend."}
              </p>
              {!isDraft && mailtoHref && (
                <p className="w-full text-[12px] leading-snug text-mut">Ponuda je već označena kao poslana.</p>
              )}
            </>
          )}
          {isDraft && (waLink || canShare) && (
            <p className="w-full text-[12px] leading-snug text-mut">
              Kad je pošaljete porukom, ponuda se odmah označava kao poslana — tek tada je kupac može otvoriti.
            </p>
          )}
        </div>
      )}

      <FeedbackLine feedback={feedback} />
    </Card>
  );
}

/* ================================================================== forms */

export function DuplicateQuoteForm({ id, action }: { id: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Dupliciram…">
        <IconDuplicate />
        Dupliciraj
      </SubmitButton>
    </form>
  );
}

export function DeleteDraftForm({ id, number, action }: { id: string; number: string; action: (formData: FormData) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {!asking ? (
        <Button variant="ghost" size="sm" icon={<IconTrash />} onClick={() => setAsking(true)} className="text-rose-300/90 hover:text-rose-200">
          Obriši nacrt
        </Button>
      ) : (
        <div className="rounded-xl border border-rose-300/25 bg-rose-400/[0.06] p-3" role="group" aria-label={`Brisanje nacrta ${number}`}>
          <p className="text-[12.5px] leading-snug text-rose-100">Trajno obrisati nacrt {number}? Ovo se ne može poništiti.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="sm" pendingLabel="Brišem…">
              Da, obriši
            </SubmitButton>
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Odustani
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function PrintButton({ label = "Ispiši / spremi PDF", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <Button variant={variant} size="sm" icon={<IconPrint />} onClick={() => window.print()}>
      {label}
    </Button>
  );
}

