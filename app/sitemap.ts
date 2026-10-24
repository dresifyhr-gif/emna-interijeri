import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

const routes: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "monthly" },
  { path: "/studio", priority: 0.9, changeFrequency: "monthly" },
  { path: "/kuhinje", priority: 0.9, changeFrequency: "monthly" },
  { path: "/radovi", priority: 0.8, changeFrequency: "weekly" },
  { path: "/ormari", priority: 0.7, changeFrequency: "monthly" },
  { path: "/interijeri", priority: 0.7, changeFrequency: "monthly" },
  { path: "/kontakt", priority: 0.7, changeFrequency: "yearly" },
  { path: "/o-nama", priority: 0.6, changeFrequency: "yearly" },
  { path: "/pitanja", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privatnost", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");
  const lastModified = new Date();
  return routes.map((r) => ({
    url: r.path === "/" ? base : `${base}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
