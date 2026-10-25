/**
 * Database schema (Drizzle, Postgres on Neon).
 *
 * Migrations: `npm run db:generate` writes SQL into drizzle/, `npm run db:migrate` applies it
 * (direct connection DATABASE_URL_UNPOOLED, see drizzle.config.ts). Never edit an applied migration.
 *
 * Kept free of "server-only" and Next imports: drizzle-kit loads this file in plain Node.
 * Money is always integer euro cents; percentages are numeric(5,2) read as JS numbers.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { LEAD_SOURCES, LEAD_STATUSES, QUOTE_STATUSES } from "./enums";

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "));

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ================================================================== admin users */

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** always stored lower-case (normalizeUsername in lib/auth/password.ts) */
    username: text("username").notNull(),
    /** "scrypt$N$r$p$salt$hash" (lib/auth/password.ts) */
    passwordHash: text("password_hash").notNull(),
    /** bump to invalidate every session of this user (e.g. after a password change) */
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: createdAt(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("admin_users_username_key").on(t.username),
    check("admin_users_username_lower", sql`${t.username} = lower(${t.username})`),
  ],
);

/* ================================================================== leads (upiti) */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** human id, "U-2026-0001" (lib/db/numbers.ts) */
    number: text("number").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    source: text("source", { enum: LEAD_SOURCES }).notNull(),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("novi"),

    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    city: text("city"),
    interest: text("interest"),
    timeline: text("timeline"),
    message: text("message"),

    /** sanitized KitchenConfig (lib/studio/plan.ts sanitizeConfig) — studio leads only */
    config: jsonb("config").$type<Record<string, unknown>>(),
    /** absolute link that re-opens the kitchen in the studio, always on site.url */
    configUrl: text("config_url"),
    /** human-readable lines, e.g. ["Oblik: kuhinja u obliku slova L", …] */
    summary: jsonb("summary").$type<string[]>(),
    /** okvirna cijena in whole euros (as shown in the studio) */
    priceLow: integer("price_low"),
    priceHigh: integer("price_high"),
    /** private Blob pathname, e.g. "leads/<id>.jpg" — serve via /api/admin/files/<path> */
    snapshotPath: text("snapshot_path"),

    /** owner's internal notes (never shown to the customer) */
    notes: text("notes"),
    /** owner notification e-mail went out (null = not sent / e-mail not configured) */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** customer confirmation e-mail went out */
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("leads_number_key").on(t.number),
    index("leads_created_at_idx").on(t.createdAt.desc()),
    index("leads_status_idx").on(t.status),
    check("leads_source_check", sql`${t.source} in (${inList(LEAD_SOURCES)})`),
    check("leads_status_check", sql`${t.status} in (${inList(LEAD_STATUSES)})`),
  ],
);

/* ================================================================== quotes (ponude) */

/** one line of a quote; money in euro cents */
export interface QuoteItem {
  /** stable client-side id (e.g. crypto.randomUUID()) so rows can be reordered/edited */
  id: string;
  description: string;
  details?: string;
  qty: number;
  /** "kom", "m", "m²", "kompl." … */
  unit: string;
  unit_price_cents: number;
  /** 0–100 */
  discount_pct: number;
}

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** human id, "P-2026-0001" (lib/db/numbers.ts) */
    number: text("number").notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    status: text("status", { enum: QUOTE_STATUSES }).notNull().default("nacrt"),

    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    /** business customers (R1 račun) */
    customerOib: text("customer_oib"),

    title: text("title").notNull().default(""),
    items: jsonb("items").$type<QuoteItem[]>().notNull().default(sql`'[]'::jsonb`),
    /** whole-quote discount, applied after line discounts (0–100) */
    discountPct: numeric("discount_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(25),
    /** "YYYY-MM-DD" */
    validUntil: date("valid_until", { mode: "string" }),
    notes: text("notes"),
    terms: text("terms"),

    /** unguessable token for the customer's public link (lib/db/numbers.ts newPublicToken) */
    publicToken: text("public_token").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("quotes_number_key").on(t.number),
    uniqueIndex("quotes_public_token_key").on(t.publicToken),
    index("quotes_lead_id_idx").on(t.leadId),
    index("quotes_created_at_idx").on(t.createdAt.desc()),
    check("quotes_status_check", sql`${t.status} in (${inList(QUOTE_STATUSES)})`),
    check("quotes_discount_pct_check", sql`${t.discountPct} >= 0 and ${t.discountPct} <= 100`),
    check("quotes_vat_pct_check", sql`${t.vatPct} >= 0 and ${t.vatPct} <= 100`),
  ],
);

/* ================================================================== settings */

/** key/value store for company data the owner enters in admin (keys: lib/admin/settings.ts) */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/* ================================================================== internals */

/** yearly sequences for human numbers: key "lead:2026" / "quote:2026" → last issued value */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});

/**
 * Fixed-window throttle (login attempts). `key` is an HMAC of the scope + IP/username,
 * so no raw IP or username is stored.
 */
export const authThrottle = pgTable("auth_throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type Setting = typeof settings.$inferSelect;
