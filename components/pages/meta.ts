import type { Metadata } from "next";
import { site } from "@/lib/site";

type OgImage = { url: string; width: number; height: number; alt?: string };

/**
 * Share images (1200×630, what WhatsApp, Facebook and Viber show for a link): a real EMNA kitchen by default
 * (public/og-image.jpg — galerija/kuhinja-crna-mramor-2.jpg beside the white logo on the hero's charcoal), the studio's
 * own 3D render for /studio. A page can still pass its own image.
 */
export const SHARE_IMAGE: OgImage = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Crna kuhinja po mjeri, EMNA Interijeri",
};

const SHARE_IMAGES: Record<string, OgImage> = {
  "/studio": { url: "/og/studio.jpg", width: 1200, height: 630, alt: "Kuhinja složena u 3D studiju EMNA Interijeri" },
};

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
      images: [image ?? SHARE_IMAGES[path] ?? SHARE_IMAGE],
    },
  };
}
