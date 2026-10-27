/**
 * Server-side: resolves the hero's three material pairs to display names, swatches and the studio's rough price from
 * the catalogue, so the client hero component never has to import lib/studio/catalog.ts or price.ts.
 */

import { frontDef, topDef } from "@/lib/studio/catalog";
import { estimate, formatPrice } from "@/lib/studio/price";
import { showcasePresets } from "@/lib/studio/showcase";
import { HERO_CONFIG, type HeroPreset } from "./heroConfig";
import type { KitchenConfig } from "@/lib/studio/types";

/** The same three material pairs the engine cycles through in showcase mode (shared list in lib/studio/showcase.ts). */
export function heroPresets(cfg: KitchenConfig = HERO_CONFIG): HeroPreset[] {
  return showcasePresets(cfg).map((p) => {
    const f = frontDef(p.front);
    const t = topDef(p.top);
    return {
      ...p,
      frontName: f?.name ?? p.front,
      topName: t?.name ?? p.top,
      frontSwatch: f?.swatch ?? "#2c2d30",
      topSwatch: t?.swatch ?? "#e6e2db",
      href: `/studio?front=${encodeURIComponent(p.front)}&top=${encodeURIComponent(p.top)}`,
      price: formatPrice(estimate({ ...cfg, front: p.front, top: p.top })),
    };
  });
}

