/**
 * The real dependencies of the "Opiši kuhinju" handler (server only): the admin session (lib/auth/session.ts), the
 * database throttle (lib/auth/throttle.ts) and the AI Gateway model call. app/api/studio/ai/route.ts uses it.
 */
import "server-only";
import { getSession } from "@/lib/auth/session";
import { clientIp, isSameOrigin } from "@/lib/auth/request";
import { hitThrottle } from "@/lib/auth/throttle";
import { isDbConfigured } from "@/lib/db";
import { createStudioAiHandler } from "./handler";
import { createGatewayModelCall } from "./model";
import { modelSettings } from "./status";

/** built per request so a changed env (STUDIO_AI …) applies without a redeploy of the module state */
export function studioAiHandler() {
  const env = process.env;
  return createStudioAiHandler({
    env,
    isAdmin: async () => Boolean(await getSession()),
    throttle: isDbConfigured() ? (scope, key, opts) => hitThrottle(scope, key, opts) : null,
    callModel: createGatewayModelCall(modelSettings(env)),
    clientIp: (req) => clientIp(req.headers),
    sameOrigin: (req) => isSameOrigin(req.headers, req.url),
  });
}
