/**
 * Croatian labels and badge tones for stored statuses (client-safe, no DB imports).
 *
 *   <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
 *   or simply <LeadStatusBadge status={lead.status} /> from components/admin/ui
 */
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  QUOTE_STATUSES,
  type LeadSource,
  type LeadStatus,
  type QuoteStatus,
} from "@/lib/db/enums";

export { LEAD_SOURCES, LEAD_STATUSES, QUOTE_STATUSES, type LeadSource, type LeadStatus, type QuoteStatus };

export type BadgeTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger" | "muted";

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novi: "Novi",
  u_obradi: "U obradi",
  ponuda_poslana: "Ponuda poslana",
  prihvaceno: "Prihvaćeno",
  odbijeno: "Odbijeno",
  arhiva: "Arhiva",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  novi: "accent",
  u_obradi: "info",
  ponuda_poslana: "warning",
  prihvaceno: "success",
  odbijeno: "danger",
  arhiva: "muted",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  nacrt: "Nacrt",
  poslana: "Poslana",
  prihvacena: "Prihvaćena",
  odbijena: "Odbijena",
  istekla: "Istekla",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  nacrt: "neutral",
  poslana: "info",
  prihvacena: "success",
  odbijena: "danger",
  istekla: "muted",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  studio: "3D studio",
  kontakt: "Kontakt forma",
};

/** ready-made <Select> options */
export const LEAD_STATUS_OPTIONS = LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABEL[value] }));
export const QUOTE_STATUS_OPTIONS = QUOTE_STATUSES.map((value) => ({ value, label: QUOTE_STATUS_LABEL[value] }));
export const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.map((value) => ({ value, label: LEAD_SOURCE_LABEL[value] }));
