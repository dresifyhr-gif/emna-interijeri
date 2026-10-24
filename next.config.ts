import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // only local photos from /public/galerija — no remote image hosts.
    // 90 is used by the full-screen lightbox on /radovi.
    qualities: [75, 90],
  },
  async redirects() {
    return [
      // legacy routes from the old site
      // only the old page itself — /galerija/*.jpg are the real photos in /public and must not redirect
      { source: "/galerija", destination: "/radovi", permanent: true },
      { source: "/konfigurator", destination: "/studio", permanent: true },
      { source: "/blog", destination: "/pitanja", permanent: true },
      { source: "/blog/:slug*", destination: "/pitanja", permanent: true },
    ];
  },
};

export default nextConfig;
