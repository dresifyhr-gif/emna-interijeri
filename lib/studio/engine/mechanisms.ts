/**
 * Mechanism demos: open every moving part of a module in a calm sequence
 * (doors swing on their hinge, drawers glide out, flaps lift around the top
 * edge — a bi-fold's lower front folds back over the upper one —, the
 * dishwasher/oven door drops, the larder and the bottle rack pull out, corner
 * trays swing out, Magic-corner baskets glide sideways and forward), hold,
 * then close in reverse order.
 */

import type { Holder, ModuleRT } from "./modules";
import { restModule } from "./modules";
import { E, type Tweens } from "./tween";

const tokens = new WeakMap<ModuleRT, number>();

function pose(h: Holder, k: number): void {
  const n = h.node;
  switch (h.kind) {
    case "door":
      n.rotation.y = h.rest.r.y + h.amount * k;
      break;
    case "swing": {
      // pull out first, turn towards the end — reads as a curved swing
      const kz = Math.min(1, k * 1.25);
      const kr = Math.max(0, (k - 0.25) / 0.75);
      n.position.z = h.rest.p.z + (h.dz ?? 0) * kz;
      n.position.x = h.rest.p.x + (h.dx ?? 0) * k;
      n.rotation.y = h.rest.r.y + h.amount * kr;
      break;
    }
    case "glide": {
      // sideways first, then towards the room (Magic corner baskets)
      const kx = Math.min(1, k / 0.6);
      const kz = Math.max(0, (k - 0.4) / 0.6);
      n.position.x = h.rest.p.x + (h.dx ?? 0) * kx;
      n.position.z = h.rest.p.z + (h.dz ?? 0) * kz;
      break;
    }
    case "flap":
    case "drop":
      n.rotation.x = h.rest.r.x + h.amount * k;
      break;
    case "drawer":
    case "pull":
    case "visor":
      n.position.z = h.rest.p.z + h.amount * k;
      break;
    default:
      break;
  }
}

export function canDemo(m: ModuleRT): boolean {
  return m.holders.some((h) => h.kind !== "fixed");
}

/** open, hold, close. Resolves when closed (or when stopped). */
export async function playDemo(tw: Tweens, m: ModuleRT, opts: { reduced: boolean; hold?: number } = { reduced: false }): Promise<void> {
  if (m.busy || !canDemo(m)) return;
  const token = (tokens.get(m) ?? 0) + 1;
  tokens.set(m, token);
  m.busy = true;
  const alive = () => tokens.get(m) === token;
  const moving = m.holders.filter((h) => h.kind !== "fixed");
  const speed = opts.reduced ? 0.6 : 1;
  const open = 0.9 * speed;
  const close = 0.8 * speed;
  const hold = opts.hold ?? 1.5;
  const maxDelay = Math.max(0, ...moving.map((h) => h.delay));
  await Promise.all(moving.map((h) => tw.run(open, h.delay * speed, (e) => pose(h, e), E.premium, m)));
  if (!alive()) return;
  await tw.wait(hold, m);
  if (!alive()) return;
  await Promise.all(moving.map((h) => tw.run(close, (maxDelay - h.delay) * 0.6 * speed, (e) => pose(h, 1 - e), E.inOut, m)));
  if (!alive()) return;
  restModule(m);
  m.busy = false;
}

/** stop a running demo immediately and snap everything shut */
export function stopDemo(tw: Tweens, m: ModuleRT): void {
  tokens.set(m, (tokens.get(m) ?? 0) + 1);
  tw.cancel(m);
  restModule(m);
  m.busy = false;
}
