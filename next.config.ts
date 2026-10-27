import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy, report-only for now: the browser logs what it would block and blocks nothing. Everything the
 * site loads is its own (fonts are self-hosted by next/font, the studio's workers come from /_next, the PDF and photo
 * previews use data: and blob: URLs). Next's inline bootstrap scripts need 'unsafe-inline'; `next dev` also needs
 * eval and its websocket. Enforce it once the console stays clean.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/**
 * Every public page and file. /admin, /ponuda and their APIs are left out on purpose: proxy.ts hardens those
 * (X-Frame-Options DENY, frame-ancestors 'none', their own referrer policy), and a second, different value here would
 * only conflict with it.
 */
const PUBLIC = "/:path((?!admin(?:/|$)|ponuda(?:/|$)|api/admin(?:/|$)|api/ponuda(?:/|$)).*)";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // only local photos from /public/galerija — no remote image hosts.
    // 90 is used by the full-screen lightbox on /radovi.
    qualities: [75, 90],
    // optimized photos are cached for at least a month (31 days) instead of being revalidated on every visit
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        source: PUBLIC,
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // the studio's AI assistant takes dictation, so the microphone stays allowed for the site itself
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      {
        // the real photos never change under the same name: replacing one means a new file name
        source: "/galerija/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // the homepage clip and its stills follow the same rule: a new cut gets a new file name
        source: "/video/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
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
