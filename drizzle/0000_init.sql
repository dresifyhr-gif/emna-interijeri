CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_username_lower" CHECK ("admin_users"."username" = lower("admin_users"."username"))
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'novi' NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city" text,
	"interest" text,
	"timeline" text,
	"message" text,
	"config" jsonb,
	"config_url" text,
	"summary" jsonb,
	"price_low" integer,
	"price_high" integer,
	"snapshot_path" text,
	"notes" text,
	"notified_at" timestamp with time zone,
	"confirmation_sent_at" timestamp with time zone,
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('studio', 'kontakt')),
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('novi', 'u_obradi', 'ponuda_poslana', 'prihvaceno', 'odbijeno', 'arhiva'))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"lead_id" uuid,
	"status" text DEFAULT 'nacrt' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"customer_address" text,
	"customer_oib" text,
	"title" text DEFAULT '' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"vat_pct" numeric(5, 2) DEFAULT 25 NOT NULL,
	"valid_until" date,
	"notes" text,
	"terms" text,
	"public_token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_status_check" CHECK ("quotes"."status" in ('nacrt', 'poslana', 'prihvacena', 'odbijena', 'istekla')),
	CONSTRAINT "quotes_discount_pct_check" CHECK ("quotes"."discount_pct" >= 0 and "quotes"."discount_pct" <= 100),
	CONSTRAINT "quotes_vat_pct_check" CHECK ("quotes"."vat_pct" >= 0 and "quotes"."vat_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_number_key" ON "leads" USING btree ("number");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_public_token_key" ON "quotes" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "quotes_lead_id_idx" ON "quotes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at" DESC NULLS LAST);