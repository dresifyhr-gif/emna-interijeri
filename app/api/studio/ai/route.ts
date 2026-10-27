/**
 * /api/studio/ai — "Opiši kuhinju": the customer describes a kitchen (or sends a photo), the AI fills a brief or edit
 * operations and the studio's own code builds the kitchen. Node.js runtime (the default; no `runtime` export, so it stays
 * compatible with Cache Components). Everything lives in lib/studio/ai (handler.ts: the contract and the checks).
 *
 *   GET   → { enabled }                                   may this visitor use it (STUDIO_AI: off / admin / on)
 *   POST  { message, config, image, history } → { ok, config, changed, reply, notes, assumptions } | { ok: false, error, message }
 */
import { studioAiHandler } from "@/lib/studio/ai/server";

/** the model call has its own timeout (STUDIO_AI_TIMEOUT_MS, default 45 s); this leaves room for the rest */
export const maxDuration = 60;

export async function GET(req: Request) {
  return studioAiHandler().GET(req);
}

export async function POST(req: Request) {
  return studioAiHandler().POST(req);
}
