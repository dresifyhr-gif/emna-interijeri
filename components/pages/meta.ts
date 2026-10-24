import type { Metadata } from "next";
import { site } from "@/lib/site";

type OgImage = { url: string; width: number; height: number; alt?: string };

/**
 * Per-page metadata: title (root layout adds " · EMNA Interijeri"), description,
 * canonical and a complete openGraph block (child openGraph replaces the parent's,
 * so it has to carry siteName/locale/images again).
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: OgImage;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: site.locale,
      siteName: site.name,
      url: path,
      title: `${title} · ${site.name}`,
      description,
      images: [image ?? { url: "/og-image.jpg", width: 1200, height: 630 }],
    },
  };
}
