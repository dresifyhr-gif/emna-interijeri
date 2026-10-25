/**
 * drizzle-kit config. Migrations run over the DIRECT (non-pooled) Neon connection.
 * The npm scripts load .env.local with `node --env-file-if-exists` (no dotenv package):
 *   npm run db:generate   SQL migration from lib/db/schema.ts → drizzle/
 *   npm run db:migrate    apply pending migrations
 *   npm run db:studio     browse the data
 */
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
