import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { gallery } from "@/lib/gallery";
import { kitchenHero, kitchenPicks } from "@/components/pages/kuhinje/data";

type Route = {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
  /** when the page's content last changed — set by hand with the change, so search engines can trust it */
  lastModified: string;
  /** photos on the page, as /public paths (image sitemap) */
  images?: string[];
};

const routes: Route[] = [
  { path: "/", priority: 1, changeFrequency: "monthly", lastModified: "2026-10-27" },
  { path: "/studio", priority: 0.9, changeFrequency: "monthly", lastModified: "2026-10-27" },
  {
    path: "/kuhinje",
    priority: 0.9,
    changeFrequency: "monthly",
    lastModified: "2026-10-27",
    images: [kitchenHero, ...kitchenPicks],
  },
  {
    path: "/radovi",
    priority: 0.8,
    changeFrequency: "weekly",
    lastModified: "2026-10-27",
    images: gallery.map((p) => p.src),
  },
  { path: "/ormari", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-27" },
  { path: "/interijeri", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-27" },
  { path: "/kontakt", priority: 0.7, changeFrequency: "yearly", lastModified: "2026-10-27" },
  { path: "/o-nama", priority: 0.6, changeFrequency: "yearly", lastModified: "2026-10-27" },
  // the answers have not changed since the site went live
  { path: "/pitanja", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-24" },
  { path: "/privatnost", priority: 0.2, changeFrequency: "yearly", lastModified: "2026-10-27" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");
  return routes.map((r) => ({
    url: r.path === "/" ? base : `${base}${r.path}`,
    lastModified: r.lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    ...(r.images && { images: r.images.map((src) => `${base}${src}`) }),
  }));
}
