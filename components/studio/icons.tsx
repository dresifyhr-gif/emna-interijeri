/**
 * Thin line icons for the studio — drawn like the site's technical drawings (1.25 stroke, square-ish caps).
 * All are decorative (aria-hidden); the controls that use them carry their own labels.
 */
import type { ReactNode, SVGProps } from "react";
import type { Layout } from "@/lib/studio/types";

type P = SVGProps<SVGSVGElement>;

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children, viewBox = "0 0 24 24", ...rest }: P) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/** small circles (bottle ends of a wine rack) on a grid, as one path */
const dots = (xs: number[], ys: number[], r: number) =>
  ys.flatMap((y) => xs.map((x) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`)).join("");

/* ------------------------------------------------------------------ layouts (top view) */

export function LayoutIcon({ layout, ...rest }: P & { layout: Layout }) {
  const wall = { ...line, strokeOpacity: 0.4, strokeWidth: 1 };
  const cab = { ...line, fill: "currentColor", fillOpacity: 0.12 };
  return (
    <Svg viewBox="0 0 48 48" {...rest}>
      {layout === "ravna" && (
        <>
          <path d="M5 7.5h38" {...wall} />
          <path d="M5 13.5v22M43 13.5v22" {...wall} strokeDasharray="1.5 3" />
          <rect x="7" y="8.5" width="34" height="7" rx="0.5" {...cab} />
        </>
      )}
      {layout === "L" && (
        <>
          <path d="M6.5 43V7.5H43" {...wall} />
          <path d="M7.5 8.5H41v7H14.5V41h-7Z" {...cab} />
        </>
      )}
      {layout === "U" && (
        <>
          <path d="M6.5 43V7.5h35V43" {...wall} />
          <path d="M7.5 8.5h33V41h-7V15.5h-19V41h-7Z" {...cab} />
        </>
      )}
      {layout === "otok" && (
        <>
          <path d="M5 7.5h38" {...wall} />
          <rect x="7" y="8.5" width="34" height="7" rx="0.5" {...cab} />
          <rect x="13" y="26" width="22" height="9" rx="0.5" {...cab} />
          <path d="M16 38.5h.01M24 38.5h.01M32 38.5h.01" {...line} strokeWidth={2.2} />
        </>
      )}
      {layout === "poluotok" && (
        <>
          <path d="M3 7.5h38" {...wall} />
          <path d="M3 13.5v22" {...wall} strokeDasharray="1.5 3" />
          <path d="M5 8.5h34v29h-7.5V15.5H5Z" {...cab} />
          <path d="M43.5 21h.01M43.5 29h.01" {...line} strokeWidth={2.2} />
        </>
      )}
      {layout === "G" && (
        <>
          <path d="M5.5 43V7.5H41" {...wall} />
          <path d="M6.5 8.5H39v28h-7.5V15.5H13.5V41h-7Z" {...cab} />
          <path d="M43.5 20.5h.01M43.5 28.5h.01" {...line} strokeWidth={2.2} />
        </>
      )}
    </Svg>
  );
}

/* ------------------------------------------------------------------ module types (front view) */

/** small line drawing of a module type (front view; corner units from above) — every catalogue type has one */
export function ModuleGlyph({ type, zone, ...rest }: P & { type: string; zone: string }) {
  const z = zone === "island" ? "base" : zone;
  const soft = { ...line, strokeOpacity: 0.45 };
  const dash = { ...soft, strokeDasharray: "1.5 2" };
  const box = <rect x="7" y="7" width="18" height="19" rx="1" {...line} />;
  const upperBox = <rect x="7" y="7" width="18" height="18" rx="1" {...line} />;
  const tallBox = <rect x="10" y="3.5" width="12" height="25" rx="1" {...line} />;
  let body: ReactNode;
  switch (`${z}:${type}`) {
    // ---------------------------------------------------------------- base
    case "base:ladice":
      body = (
        <>
          {box}
          <path d="M7 13.2h18M7 19.5h18" {...line} />
          <path d="M14 10.1h4M14 16.3h4M14 22.7h4" {...line} />
        </>
      );
      break;
    case "base:ladice2":
      body = (
        <>
          {box}
          <path d="M7 16.5h18" {...line} />
          <path d="M14 11.5h4M14 21h4" {...line} />
        </>
      );
      break;
    case "base:ladice4":
      body = (
        <>
          {box}
          <path d="M7 11.8h18M7 16.5h18M7 21.2h18" {...line} />
          <path d="M14.5 9.4h3M14.5 14.1h3M14.5 18.9h3M14.5 23.6h3" {...line} />
        </>
      );
      break;
    case "base:ladice-unutarnja":
      body = (
        <>
          {box}
          <path d="M7 16.5h18" {...line} />
          <path d="M14 21h4" {...line} />
          <rect x="9.5" y="9.3" width="13" height="3.2" rx="0.5" {...dash} />
          <path d="M14 14.4h4" {...line} />
        </>
      );
      break;
    case "base:vrata":
      body = (
        <>
          {box}
          <path d="M21.5 10v4" {...line} />
          <path d="M9.5 16.5h13" {...dash} />
        </>
      );
      break;
    case "base:vrata2":
      body = (
        <>
          {box}
          <path d="M16 7v19" {...line} />
          <path d="M14.2 10v4M17.8 10v4" {...line} />
          <path d="M9 16.5h5M18 16.5h5" {...dash} />
        </>
      );
      break;
    case "base:sudoper":
      body = (
        <>
          <path d="M4.5 12.5h23" {...line} />
          <rect x="7" y="12.5" width="18" height="13.5" rx="1" {...line} />
          <path d="M11 12.5v2.5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.5" {...line} />
          <path d="M21.5 12.5V7.5h-3.5" {...line} />
        </>
      );
      break;
    case "base:perilica":
      body = (
        <>
          {box}
          <path d="M7 11h18" {...line} />
          <circle cx="21.5" cy="9" r="0.6" fill="currentColor" stroke="none" />
          <path d="M10 16h12M10 19.5h12M10 23h12" {...soft} />
        </>
      );
      break;
    case "base:smece":
      body = (
        <>
          {box}
          <path d="M14 10h4" {...line} />
          <path d="M10 14.5h5.2l-.6 9h-4Z M16.8 14.5H22l-.6 9h-4Z" {...soft} />
        </>
      );
      break;
    case "base:ploca":
      body = (
        <>
          <rect x="5.5" y="7.5" width="21" height="17" rx="1.5" {...line} />
          <circle cx="11.5" cy="13" r="2.8" {...line} />
          <circle cx="20.5" cy="13" r="2" {...line} />
          <circle cx="11.5" cy="19.8" r="2" {...line} />
          <circle cx="20.5" cy="19.8" r="2.8" {...line} />
        </>
      );
      break;
    case "base:ploca-pecnica":
      body = (
        <>
          <path d="M4.5 9.5h23" {...line} />
          <path d="M9.5 7.6h4.5M18 7.6h4.5" {...line} strokeWidth={1.6} />
          <rect x="7" y="9.5" width="18" height="16.5" rx="1" {...line} />
          <path d="M7 12.6h18" {...soft} />
          <rect x="9.5" y="14.6" width="13" height="7.4" rx="0.8" {...soft} />
          <path d="M12 13.6h8" {...line} />
        </>
      );
      break;
    case "base:pecnica-donja":
      body = (
        <>
          {box}
          <path d="M7 20.5h18" {...line} />
          <path d="M11 9.4h10" {...line} />
          <rect x="9.5" y="11" width="13" height="7.6" rx="0.8" {...soft} />
          <path d="M14 23.2h4" {...line} />
        </>
      );
      break;
    case "base:boce":
      body = (
        <>
          <rect x="11" y="7" width="10" height="19" rx="1" {...line} />
          <path d="M14.5 9.5h3" {...line} />
          <path d="M13.2 24v-5.5l.8-1.4V14h1v3.1l.8 1.4V24Z M17 24v-4.6l.7-1.2v-2.6h.9v2.6l.7 1.2V24Z" {...soft} />
        </>
      );
      break;
    case "base:police":
      body = (
        <>
          <path d="M7 7v19h18V7" {...line} />
          <path d="M7 7h18" {...soft} />
          <path d="M7 13.5h18M7 20h18" {...line} />
          <path d="M10 13.5v-3h2.5v3M19.5 20v-3.6M21.5 20v-2.4" {...soft} />
        </>
      );
      break;
    case "base:slobodno":
      body = (
        <>
          <path d="M4.5 7h23" {...line} />
          <rect x="7" y="9" width="18" height="17" rx="1" {...dash} />
        </>
      );
      break;
    case "base:filer":
      body = (
        <>
          <path d="M4.5 7h23" {...soft} />
          <rect x="14" y="7" width="4" height="19" rx="0.5" {...line} />
        </>
      );
      break;
    case "base:vitrina":
      body = (
        <>
          {box}
          <rect x="9.5" y="9.5" width="13" height="14" rx="0.5" {...soft} />
          <path d="M9.5 16.5h13" {...dash} />
          <path d="M12 22l4.5-5.5M15.5 22.5l3-3.6" {...soft} />
        </>
      );
      break;
    case "base:vinoteka":
      body = (
        <>
          <path d="M7 7v19h18V7" {...line} />
          <path d="M7 7h18" {...soft} />
          <path d={dots([11, 16, 21], [11.2, 16.5, 21.8], 1.8)} {...soft} />
        </>
      );
      break;
    case "base:police-zaobljene":
      body = (
        <>
          <path d="M7 7h10.5a7.5 7.5 0 0 1 7.5 7.5V26H7Z" {...line} />
          <path d="M7 13.5h17.3M7 20h18" {...soft} />
        </>
      );
      break;
    case "base:police-kose":
      body = (
        <>
          <path d="M7 7h9l9 9v10H7Z" {...line} />
          <path d="M7 13.5h15.5M7 20h18" {...soft} />
        </>
      );
      break;
    case "base:bocna":
      body = (
        <>
          <path d="M4.5 9h8M4.5 26h8" {...dash} />
          <rect x="12.5" y="6.5" width="7" height="19.5" rx="0.6" {...line} />
        </>
      );
      break;
    case "base:bocna-radna":
      body = (
        <>
          <path d="M4.5 10.5h8M4.5 26h8" {...dash} />
          <path d="M4.5 6.5h16v19.5h-4V10.5H4.5" {...line} />
        </>
      );
      break;
    case "base:bocna-rebrasta":
      body = (
        <>
          <path d="M4.5 9h7M4.5 26h7" {...dash} />
          <rect x="11.5" y="6.5" width="9" height="19.5" rx="0.6" {...line} />
          <path d="M14.5 6.5v19.5M17.5 6.5v19.5" {...soft} />
        </>
      );
      break;
    case "base:kutni":
      body = (
        <>
          <path d="M5.5 6.5h21v7h-13v13h-8Z" {...line} />
          <path d="M13.5 22.5a9 9 0 0 0 9-9" {...dash} />
          <path d="M10 10h.01" {...line} strokeWidth={2.2} />
        </>
      );
      break;
    case "base:kutni-lemans":
      body = (
        <>
          <path d="M5.5 6.5h21v7h-13v13h-8Z" {...line} />
          <path d="M8 12.5c3-1.4 6-1.8 9.5-1.2M9.5 16c2.6-.6 5.6-.6 8.2.2" {...soft} />
          <path d="M18.5 19.5l3 2.2-3 2.2" {...soft} />
        </>
      );
      break;
    case "base:kutni-magic":
      body = (
        <>
          <path d="M5.5 6.5h21v7h-13v13h-8Z" {...line} />
          <rect x="7.5" y="8.5" width="4" height="3" rx="0.4" {...soft} />
          <rect x="7.5" y="16" width="4" height="3" rx="0.4" {...soft} />
          <path d="M16 18.5h5.5m-2-2 2 2-2 2" {...soft} />
        </>
      );
      break;

    // L-shaped / diagonal corner units (seen from above, the corner top left)
    case "base:kutni-l":
    case "upper:kutni-l":
      body = (
        <>
          <path d="M5.5 6.5h20v9h-11v11h-9Z" {...line} />
          <path d="M14.5 15.5l3.2 3.2M14.5 15.5l-3.2 3.2" {...soft} />
          <path d="M18 15.5h7.5M14.5 19v7.5" {...dash} />
        </>
      );
      break;
    case "base:kutni-l-karusel":
      body = (
        <>
          <path d="M5.5 6.5h20v9h-11v11h-9Z" {...line} />
          <circle cx="11" cy="12" r="4" {...soft} />
          <path d="M11 8v8M7 12h8" {...soft} />
        </>
      );
      break;
    case "base:kutni-ladice":
      body = (
        <>
          <path d="M5.5 6.5h20v9h-11v11h-9Z" {...line} />
          <path d="M8.5 23V9.5H23M11.5 23V12.5H23" {...soft} />
          <path d="M18.5 19.5l4 4m0-3.2v3.2h-3.2" {...soft} />
        </>
      );
      break;
    case "base:kutni-dijagonalni":
    case "upper:kutni-dijagonalni":
      body = (
        <>
          <path d="M5.5 6.5h20v9l-11 11h-9Z" {...line} />
          <path d="M23 16.5l-7.5 7.5" {...dash} />
          <path d="M17.5 19.5l1.6 1.6" {...line} />
        </>
      );
      break;
    case "upper:kutni-dijagonalni-staklo":
      body = (
        <>
          <path d="M5.5 6.5h20v9l-11 11h-9Z" {...line} />
          <path d="M9 10h11M9 14.5h9.5M9 19h5" {...soft} />
          <path d="M21.5 12.5l2-2M18 19l3-3" {...soft} />
        </>
      );
      break;
    case "upper:kutna-polica":
    case "base:kutna-polica":
      body = (
        <>
          <path d="M5.5 6.5h20v9h-11v11h-9Z" {...dash} />
          <path d="M8.5 23V9.5H23" {...line} />
          <path d="M11.5 23V12.5H23" {...soft} />
        </>
      );
      break;

    // ---------------------------------------------------------------- wall units
    case "upper:vrata":
      body = (
        <>
          {upperBox}
          <path d="M21.5 18.5v4" {...line} />
          <path d="M9.5 16h13" {...dash} />
        </>
      );
      break;
    case "upper:klapna":
      body = (
        <>
          <path d="M7 14v11.5h18V14" {...line} />
          <path d="M7 13.2 23.5 6.2" {...line} />
          <path d="M18.5 15.5a5 5 0 0 0-1.6-4.6" {...soft} />
          <path d="M9.5 20h13" {...dash} />
        </>
      );
      break;
    case "upper:klapna2":
      body = (
        <>
          <path d="M7 13.5v12h18v-12" {...line} />
          <path d="M7 13 14.5 8.6 25 10.2" {...line} />
          <path d="M14.5 8.6v1.6" {...soft} />
          <path d="M9.5 19.5h13" {...dash} />
        </>
      );
      break;
    case "upper:vitrina":
      body = (
        <>
          {upperBox}
          <rect x="10" y="10" width="12" height="12" rx="0.5" {...soft} />
          <path d="M12.5 19.5l5-6.5M15.5 20l3-4" {...soft} />
        </>
      );
      break;
    case "upper:nisa":
      body = (
        <>
          <path d="M7 7v18h18V7" {...line} />
          <path d="M7 7h18" {...soft} />
          <path d="M7 16h18" {...line} />
          <circle cx="11.5" cy="12.6" r="2" {...soft} />
          <path d="M18 25v-5.5h3V25" {...soft} />
        </>
      );
      break;
    case "upper:polica":
      body = (
        <>
          <path d="M5.5 18h21" {...line} strokeWidth={2} />
          <path d="M9 18v-5h3.2v5" {...soft} />
          <circle cx="19.5" cy="15.4" r="2.6" {...soft} />
          <path d="M8 21h16" {...dash} />
        </>
      );
      break;
    case "upper:cjedilo":
      body = (
        <>
          {upperBox}
          <path d="M11 11.5v8M13.5 11.5v8M16 11.5v8M18.5 11.5v8" {...soft} />
          <path d="M10 21h12" {...line} />
          <path d="M21.5 18.5v4" {...line} />
        </>
      );
      break;
    case "upper:napa":
      body = (
        <>
          <rect x="7" y="6.5" width="18" height="9" rx="1" {...line} />
          <path d="M6 15.5h20l-2.2 3H8.2Z" {...line} />
          <path d="M12 26c-1-1.2 1-2.2 0-3.6M16 26c-1-1.2 1-2.2 0-3.6M20 26c-1-1.2 1-2.2 0-3.6" {...soft} />
        </>
      );
      break;
    case "upper:mikrovalna":
      body = (
        <>
          {upperBox}
          <path d="M7 11.2h18" {...line} />
          <rect x="9.5" y="13.5" width="10" height="9" rx="0.8" {...soft} />
          <path d="M22.5 14.5v.01M22.5 17.5v.01M22.5 20.5v.01" {...line} strokeWidth={1.8} />
        </>
      );
      break;
    case "upper:prazno":
      body = <rect x="7" y="7" width="18" height="18" rx="1" {...dash} />;
      break;
    case "upper:police-visece":
      body = (
        <>
          <path d="M5.5 12.5h21M5.5 21h21" {...line} strokeWidth={2} />
          <path d="M9 12.5V9h2.6v3.5M19 21v-3.6M21.2 21v-2.4" {...soft} />
          <path d="M8 14.6h16M8 23.1h16" {...dash} />
        </>
      );
      break;
    case "upper:vinoteka":
      body = (
        <>
          {upperBox}
          <path d={dots([11, 16, 21], [11, 16, 21], 1.8)} {...soft} />
        </>
      );
      break;
    case "upper:polica-zaobljena":
      body = (
        <>
          <path d="M7 7h10.5a7.5 7.5 0 0 1 7.5 7.5V25H7Z" {...line} />
          <path d="M7 13h17.2M7 19h18" {...soft} />
        </>
      );
      break;
    case "upper:polica-kosa":
      body = (
        <>
          <path d="M7 7h9l9 9v9H7Z" {...line} />
          <path d="M7 13h15M7 19h18" {...soft} />
        </>
      );
      break;
    case "upper:bocna":
      body = (
        <>
          <path d="M4.5 7h8M4.5 25h8" {...dash} />
          <rect x="12.5" y="5.5" width="7" height="21" rx="0.6" {...line} />
        </>
      );
      break;
    case "upper:bocna-rebrasta":
      body = (
        <>
          <path d="M4.5 7h7M4.5 25h7" {...dash} />
          <rect x="11.5" y="5.5" width="9" height="21" rx="0.6" {...line} />
          <path d="M14.5 5.5v21M17.5 5.5v21" {...soft} />
        </>
      );
      break;

    // ---------------------------------------------------------------- tall
    case "tall:hladnjak":
      body = (
        <>
          {tallBox}
          <path d="M10 18.5h12" {...line} />
          <path d="M19.5 7v4M19.5 21v4" {...line} />
        </>
      );
      break;
    case "tall:hladnjak-sbs":
    case "tall:hladnjak-sbs-vrata":
      body = (
        <>
          <rect x="5.5" y="3.5" width="21" height="25" rx="1" {...line} />
          <path d="M5.5 9h21" {...line} />
          {type === "hladnjak-sbs-vrata" ? <path d="M16 3.5V9" {...soft} /> : <path d="M13 6.2h6" {...soft} />}
          <path d="M8 9v19.5M24 9v19.5" {...dash} />
          <path d="M16 10.5v18" {...line} />
          <path d="M14.4 15v7M17.6 15v7" {...line} />
        </>
      );
      break;
    case "tall:pecnica":
      body = (
        <>
          {tallBox}
          <path d="M10 8h12M10 18h12M10 23.2h12" {...line} />
          <rect x="12.5" y="10.5" width="7" height="5" rx="0.8" {...soft} />
        </>
      );
      break;
    case "tall:pecnica-mikro":
      body = (
        <>
          {tallBox}
          <path d="M10 7h12M10 12.4h12M10 19.4h12M10 24h12" {...line} />
          <rect x="12.5" y="8.4" width="5.5" height="2.6" rx="0.5" {...soft} />
          <rect x="12.5" y="14" width="7" height="4" rx="0.6" {...soft} />
        </>
      );
      break;
    case "tall:smocnica":
      body = (
        <>
          {tallBox}
          <path d="M12 9h8M12 14h8M12 19h8M12 24h8" {...soft} />
          <path d="M24.5 12v8M26.5 14v4" {...soft} />
        </>
      );
      break;
    case "tall:ormar":
      body = (
        <>
          {tallBox}
          <path d="M16 3.5v25" {...line} />
          <path d="M14.4 14v4M17.6 14v4" {...line} />
          <path d="M11.5 9.5h3M17.5 9.5h3M11.5 22.5h3M17.5 22.5h3" {...soft} />
        </>
      );
      break;
    case "tall:metle":
      body = (
        <>
          {tallBox}
          <path d="M10 7.5h12" {...soft} />
          <path d="M14.5 9.5v12" {...soft} />
          <path d="M12.5 21.5h4l.8 4.5h-5.6Z" {...soft} />
          <path d="M19.5 14v4" {...line} />
        </>
      );
      break;
    case "tall:perilica-rublja":
      body = (
        <>
          {tallBox}
          <path d="M10 14h12" {...line} />
          <circle cx="16" cy="21" r="3.6" {...line} />
          <circle cx="16" cy="21" r="1.9" {...soft} />
          <path d="M19.5 7.5v4" {...line} />
        </>
      );
      break;
    case "tall:vitrina":
      body = (
        <>
          {tallBox}
          <rect x="12" y="6" width="8" height="20" rx="0.4" {...soft} />
          <path d="M12 12.6h8M12 19.3h8" {...dash} />
          <path d="M13.2 11l2.4-3M13.6 25l3-3.8" {...soft} />
        </>
      );
      break;
    case "tall:police":
      body = (
        <>
          <path d="M10 3.5v25h12v-25" {...line} />
          <path d="M10 3.5h12" {...soft} />
          <path d="M10 9.7h12M10 15.9h12M10 22.1h12" {...line} />
          <path d="M12.5 9.7V7.2h2v2.5M18.5 22.1v-2.7" {...soft} />
        </>
      );
      break;
    case "tall:vinoteka":
      body = (
        <>
          <path d="M10 3.5v25h12v-25" {...line} />
          <path d="M10 3.5h12" {...soft} />
          <path d={dots([13.3, 18.7], [7.5, 12.3, 17.1, 21.9], 1.7)} {...soft} />
          <path d="M11.5 26.3h9" {...dash} />
        </>
      );
      break;
    case "tall:kava":
      body = (
        <>
          {tallBox}
          <path d="M10 11.5h12M10 20.5h12" {...line} />
          <rect x="12.8" y="13.6" width="4.6" height="5.6" rx="0.6" {...soft} />
          <path d="M18.8 17.4h1.8v1.8h-1.8Z" {...soft} />
          <path d="M11.2 12.6v6.8M20.8 12.6v6.8" {...dash} />
          <path d="M14.4 7.5h3.2M14.4 23.8h3.2" {...line} />
        </>
      );
      break;
    case "tall:ormar-nisa":
      body = (
        <>
          {tallBox}
          <path d="M10 13.5h12M10 19.5h12" {...line} />
          <path d="M11.5 14.6h9" {...dash} />
          <rect x="13.5" y="16" width="5" height="3.5" rx="0.5" {...soft} />
          <path d="M19.5 7.5v3M19.5 22v3" {...line} />
        </>
      );
      break;
    case "tall:bocna":
      body = (
        <>
          <path d="M5 3.5h7.5M5 28.5h7.5" {...dash} />
          <rect x="12.5" y="3.5" width="7" height="25" rx="0.6" {...line} />
        </>
      );
      break;
    case "tall:bocna-rebrasta":
      body = (
        <>
          <path d="M5 3.5h6.5M5 28.5h6.5" {...dash} />
          <rect x="11.5" y="3.5" width="9" height="25" rx="0.6" {...line} />
          <path d="M14.5 3.5v25M17.5 3.5v25" {...soft} />
        </>
      );
      break;
    default:
      body = z === "tall" ? tallBox : <rect x="7" y="7" width="18" height="18" rx="1" {...line} />;
  }
  return (
    <Svg viewBox="0 0 32 32" {...rest}>
      {body}
    </Svg>
  );
}

/* ------------------------------------------------------------------ handle styles */

export function HandleGlyph({ style, ...rest }: P & { style: string }) {
  const soft = { ...line, strokeOpacity: 0.45 };
  let body: ReactNode;
  switch (style) {
    case "bez":
      body = (
        <>
          <path d="M6 7.5h20" {...line} />
          <path d="M6 10.5h20" {...line} />
          <rect x="6" y="7.5" width="20" height="3" fill="currentColor" fillOpacity={0.18} stroke="none" />
          <rect x="6" y="10.5" width="20" height="15" rx="0.8" {...line} />
        </>
      );
      break;
    case "letvica":
      body = (
        <>
          <rect x="6" y="7" width="20" height="18.5" rx="0.8" {...line} />
          <path d="M11 11.5h10" {...line} strokeWidth={2.2} />
        </>
      );
      break;
    case "gumb":
      body = (
        <>
          <rect x="6" y="7" width="20" height="18.5" rx="0.8" {...line} />
          <circle cx="16" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
        </>
      );
      break;
    case "utor":
      body = (
        <>
          <rect x="6" y="7" width="20" height="18.5" rx="0.8" {...line} />
          <path d="M6 9.4h20" {...line} strokeWidth={1.8} />
          <path d="M9 9.4v1.6h14V9.4" {...soft} />
        </>
      );
      break;
    case "luft":
      // the worktop, the carcass edge showing in the finger gap, the front starting lower
      body = (
        <>
          <path d="M4 6.5h24" {...line} strokeWidth={1.6} />
          <path d="M7 9.3h18" {...soft} strokeDasharray="1 1.8" />
          <rect x="6" y="11.2" width="20" height="14.3" rx="0.8" {...line} />
          <path d="M13.6 9.8c.8-1.1 4-1.1 4.8 0" {...soft} />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x="6" y="7" width="20" height="18.5" rx="0.8" {...line} />
          <circle cx="16" cy="16.2" r="1.1" fill="currentColor" stroke="none" />
          <path d="M12.6 16.2a3.4 3.4 0 0 1 6.8 0M10.6 16.2a5.4 5.4 0 0 1 10.8 0" {...soft} />
        </>
      );
  }
  return (
    <Svg viewBox="0 0 32 32" {...rest}>
      {body}
    </Svg>
  );
}

/* ------------------------------------------------------------------ hoods (KitchenConfig.hood) */

/**
 * A hood above the hob: "ugradbena" (in a wall unit, with its visor), "dimnjak" (chimney hood), "kosa" (angled glass, seen
 * from the side), "ploca" (downdraft in the hob); above the island "otok" (canopy from the ceiling) and "kaseta" (flush in
 * the ceiling)
 */
export function HoodGlyph({ kind, ...rest }: P & { kind: string }) {
  const soft = { ...line, strokeOpacity: 0.45 };
  const steam = <path d="M11.5 28c-.9-1.1.9-2 0-3.3M16 28c-.9-1.1.9-2 0-3.3M20.5 28c-.9-1.1.9-2 0-3.3" {...soft} />;
  let body: ReactNode;
  switch (kind) {
    case "ugradbena":
      body = (
        <>
          <rect x="6.5" y="4" width="19" height="14" rx="1" {...line} />
          <path d="M6.5 18h19l-1.6 2.6H8.1Z" {...line} />
          <path d="M14 7.5h4" {...soft} />
          {steam}
        </>
      );
      break;
    case "dimnjak":
      body = (
        <>
          <path d="M13.5 2.5v8.5h5V2.5" {...line} />
          <path d="M6.5 18.5l6.4-7.5h6.2l6.4 7.5Z" {...line} />
          <path d="M6.5 18.5h19v1.6h-19Z" {...soft} />
          {steam}
        </>
      );
      break;
    case "kosa":
      body = (
        <>
          <path d="M26.5 2.5v25" {...soft} />
          <path d="M21 2.5v8h5.5" {...line} />
          <path d="M26.5 10.5 8.5 16.5l1.3 2.4 16.7-3.4" {...line} />
          <path d="M12.5 16.1l9-2.9" {...soft} />
          {steam}
        </>
      );
      break;
    case "ploca":
      body = (
        <>
          <path d="M11 10.5c1-1.6 3.4-2 5 .8M21 10.5c-1-1.6-3.4-2-5 .8" {...soft} />
          <rect x="4.5" y="13" width="23" height="4.5" rx="1" {...line} />
          <path d="M13.5 15.25h5" {...line} strokeWidth={2} />
          <path d="M16 20v6.5M13.6 24.2 16 26.5l2.4-2.3" {...soft} />
        </>
      );
      break;
    case "kaseta":
      body = (
        <>
          <path d="M3.5 5.5h25" {...line} />
          <rect x="9" y="5.5" width="14" height="2.8" {...line} fill="currentColor" fillOpacity={0.18} />
          <path d="M12 16c-1-1.3 1-2.4 0-3.8M16 16c-1-1.3 1-2.4 0-3.8M20 16c-1-1.3 1-2.4 0-3.8" {...soft} />
          <path d="M5.5 25.5h21" {...line} />
        </>
      );
      break;
    default:
      // the island canopy hanging from the ceiling
      body = (
        <>
          <path d="M3.5 2.5h25" {...line} />
          <path d="M14 2.5v8.5h4V2.5" {...line} />
          <path d="M8.5 17.5l5-6.5h5l5 6.5Z" {...line} />
          <path d="M12 23c-.9-1.1.9-2 0-3.3M16 23c-.9-1.1.9-2 0-3.3M20 23c-.9-1.1.9-2 0-3.3" {...soft} />
          <path d="M5.5 27.5h21" {...line} />
        </>
      );
  }
  return (
    <Svg viewBox="0 0 32 32" {...rest}>
      {body}
    </Svg>
  );
}

/* ------------------------------------------------------------------ backsplash (KitchenConfig.backsplash) */

/** the wall between the worktop and the wall units: worktop material (full / half), coloured glass, tiles, nothing */
export function SplashGlyph({ kind, ...rest }: P & { kind: string }) {
  const soft = { ...line, strokeOpacity: 0.45 };
  const fill = { fill: "currentColor", fillOpacity: 0.16, stroke: "none" };
  const frame = (
    <>
      <rect x="5" y="3.5" width="22" height="6" rx="0.8" {...line} />
      <path d="M3.5 25.5h25" {...line} strokeWidth={1.6} />
    </>
  );
  let body: ReactNode;
  switch (kind) {
    case "pola":
      body = (
        <>
          {frame}
          <rect x="5" y="17.5" width="22" height="8" {...fill} />
          <path d="M5 17.5h22" {...line} />
        </>
      );
      break;
    case "staklo":
      body = (
        <>
          {frame}
          <rect x="5" y="9.5" width="22" height="16" {...fill} />
          <path d="M9 22l7-9M14 23l5-6.5M21 15.5l2.5-3" {...soft} />
        </>
      );
      break;
    case "plocice":
      body = (
        <>
          {frame}
          <path d="M5 13.5h22M5 17.5h22M5 21.5h22M10.5 9.5v4M16 9.5v4M21.5 9.5v4M8 13.5v4M13.5 13.5v4M19 13.5v4M24.5 13.5v4M10.5 17.5v4M16 17.5v4M21.5 17.5v4M8 21.5v4M13.5 21.5v4M19 21.5v4M24.5 21.5v4" {...soft} />
        </>
      );
      break;
    case "bez":
      body = (
        <>
          {frame}
          <rect x="5" y="9.5" width="22" height="16" {...soft} strokeDasharray="1.5 2.2" />
        </>
      );
      break;
    default:
      body = (
        <>
          {frame}
          <rect x="5" y="9.5" width="22" height="16" {...fill} />
          <path d="M5 9.5v16M27 9.5v16" {...soft} />
        </>
      );
  }
  return (
    <Svg viewBox="0 0 32 32" {...rest}>
      {body}
    </Svg>
  );
}

/** a glass door with a reflection (vitrine glass) */
export const GlassIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="3.5" width="13" height="17" rx="1" {...line} />
    <rect x="7.8" y="5.8" width="8.4" height="12.4" rx="0.4" {...line} strokeOpacity={0.45} />
    <path d="M9.5 15l4-5M12 16.2l2.6-3.2" {...line} strokeOpacity={0.45} />
  </Svg>
);

/** floating shelves with hooks below (rails, shelves on the wall) */
export const RailIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9h17" {...line} strokeWidth={1.6} />
    <path d="M6 9v1.5M18 9v1.5" {...line} />
    <path d="M8.5 9v3.5a1.5 1.5 0 1 0 3 0M13.5 9v3.5a1.5 1.5 0 1 0 3 0" {...line} strokeOpacity={0.6} />
    <path d="M4 19.5h16" {...line} strokeOpacity={0.45} />
  </Svg>
);

/* ------------------------------------------------------------------ ui */

export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.6" {...line} />
    <path
      d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6"
      {...line}
    />
  </Svg>
);

export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 14.6A7.5 7.5 0 0 1 9.4 5a7.5 7.5 0 1 0 9.6 9.6Z" {...line} />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...line} strokeWidth={1.4} />
  </Svg>
);

export const ChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6.5 9 12l5.5 5.5" {...line} strokeWidth={1.4} />
  </Svg>
);

export const ChevronUp = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 14.5 12 9l5.5 5.5" {...line} strokeWidth={1.4} />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 12.5l4 4 9-9.5" {...line} strokeWidth={1.5} />
  </Svg>
);

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" {...line} />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" {...line} />
  </Svg>
);

export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 6.2v11.6L18 12Z" {...line} />
  </Svg>
);

export const ResetIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" {...line} />
    <path d="M5 4.5v3.3h3.3" {...line} />
  </Svg>
);

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 7h10M9 12h10M9 17h10" {...line} />
    <path d="M5 7h.01M5 12h.01M5 17h.01" {...line} strokeWidth={2} />
  </Svg>
);

export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 12h11" {...line} strokeWidth={1.4} />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 12h11M12 6.5v11" {...line} strokeWidth={1.4} />
  </Svg>
);

export const NoteIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" {...line} />
    <path d="M12 11v5" {...line} />
    <path d="M12 8h.01" {...line} strokeWidth={2} />
  </Svg>
);

export const CursorIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 4.5 18 11l-5.2 1.6L10.6 18Z" {...line} />
  </Svg>
);

export const OrbitIcon = (p: P) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="8.5" ry="3.8" {...line} />
    <path d="M17.6 9.3l1.2-1.6 1 2" {...line} />
    <circle cx="12" cy="12" r="1.4" {...line} />
  </Svg>
);

export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5.5M10.5 7 5.5 12l5 5" {...line} strokeWidth={1.4} />
  </Svg>
);

export const ArrowRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h13.5M13.5 7l5 5-5 5" {...line} strokeWidth={1.4} />
  </Svg>
);

export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6.5 15 12l-5.5 5.5" {...line} strokeWidth={1.4} />
  </Svg>
);

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 7.5h13M10 7.5V5.5h4v2M7.5 7.5l.8 11a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-11" {...line} />
    <path d="M10.5 11v5.5M13.5 11v5.5" {...line} strokeOpacity={0.6} />
  </Svg>
);

export const UndoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 7.5 5 11.5l4 4" {...line} />
    <path d="M5.5 11.5h8a5 5 0 0 1 0 10H11" {...line} />
  </Svg>
);

export const InsertIcon = ({ side, ...p }: P & { side: "left" | "right" }) => (
  <Svg {...p}>
    {side === "left" ? (
      <>
        <rect x="12.5" y="6" width="7" height="12" rx="0.8" {...line} />
        <rect x="3.5" y="6" width="6" height="12" rx="0.8" {...line} strokeDasharray="1.5 2" strokeOpacity={0.7} />
        <path d="M6.5 10.2v3.6M4.7 12h3.6" {...line} />
      </>
    ) : (
      <>
        <rect x="4.5" y="6" width="7" height="12" rx="0.8" {...line} />
        <rect x="14.5" y="6" width="6" height="12" rx="0.8" {...line} strokeDasharray="1.5 2" strokeOpacity={0.7} />
        <path d="M17.5 10.2v3.6M15.7 12h3.6" {...line} />
      </>
    )}
  </Svg>
);

export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 9.5 12 15l5.5-5.5" {...line} strokeWidth={1.4} />
  </Svg>
);

/** "Zamijeni": another type in the same place */
export const SwapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 9h12.5M14.5 5.5 18 9l-3.5 3.5" {...line} />
    <path d="M19 15H6.5M9.5 11.5 6 15l3.5 3.5" {...line} />
  </Svg>
);

/** "Više": the full element editor */
export const MoreIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" {...line} strokeWidth={2.2} />
  </Svg>
);

/** a width between two ticks (the width chip, wall lengths) */
export const WidthIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7v10M19.5 7v10" {...line} strokeOpacity={0.7} />
    <path d="M7.5 12h9M10 9.5 7.5 12l2.5 2.5M14 9.5l2.5 2.5-2.5 2.5" {...line} />
  </Svg>
);

/** a height between two ticks (cabinet heights, "do stropa") */
export const HeightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5h10M7 19.5h10" {...line} strokeOpacity={0.7} />
    <path d="M12 7.5v9M9.5 10 12 7.5l2.5 2.5M9.5 14l2.5 2.5 2.5-2.5" {...line} />
  </Svg>
);

export const LayersIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="15" height="6.5" rx="1" {...line} />
    <rect x="4.5" y="13" width="15" height="6.5" rx="1" {...line} strokeOpacity={0.6} />
  </Svg>
);

/** a counter stool (seating) */
export const StoolIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 6.5h10" {...line} />
    <path d="M9 6.5l-2.5 14M15 6.5l2.5 14M8 14h8" {...line} />
  </Svg>
);
/** a raised bar top on its upstand (šank) */
export const BarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 13.5h11v7h-11ZM14.5 9h6.5M14.5 9v4.5" {...line} />
    <path d="M17.5 9v11.5" {...line} strokeOpacity={0.45} />
  </Svg>
);
/** a ceiling hood with its chimney */
export const HoodIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v6M10 3v6h4" {...line} />
    <path d="M7.5 13l2.5-4h4l2.5 4Z" {...line} />
    <path d="M9 17c.8-1 .8-2 0-3M12 18c.8-1 .8-2 0-3M15 17c.8-1 .8-2 0-3" {...line} strokeOpacity={0.45} />
  </Svg>
);
/** the island's body from above, with the cabinets on one side */
export const IslandIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="7.5" width="17" height="9" rx="0.8" {...line} />
    <path d="M3.5 12h17" {...line} strokeOpacity={0.45} />
    <path d="M7 14.5h.01M12 14.5h.01M17 14.5h.01" {...line} strokeWidth={2} />
  </Svg>
);
/** a paint swatch fan (room surfaces) */
export const PaletteIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4.5" width="6.5" height="15" rx="1" {...line} />
    <path d="M10.5 8.2l4.3-2.5 3.3 5.6-7.6 4.4" {...line} />
    <path d="M10.5 14.5h8.5v5h-8.5" {...line} />
    <path d="M7.25 16.5h.01" {...line} strokeWidth={2} />
  </Svg>
);

/** a document with a fold and a down arrow — "Preuzmi PDF" */
export const PdfIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z" {...line} />
    <path d="M13.5 3.5v5h5" {...line} />
    <path d="M12 11v6M9.5 14.75 12 17.25l2.5-2.5" {...line} />
  </Svg>
);

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M12.5 7A5.5 5.5 0 0 0 7 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ 2D / 3D view (ViewSwitch, PlanView) */

/** "3D": a box in perspective */
export const CubeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.8 19.5 8v8L12 20.2 4.5 16V8Z" {...line} />
    <path d="M4.5 8 12 12.2 19.5 8M12 12.2v8" {...line} />
  </Svg>
);

/** "Tlocrt": a room from above — walls in an L, a run of cabinets along them */
export const PlanIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 19.5v-15h15" {...line} />
    <path d="M7.5 7.5h12M7.5 7.5v12M7.5 10.5h3v9M10.5 7.5v3" {...line} />
  </Svg>
);

/** "Nacrt": a wall seen from the front — wall units over base cabinets */
export const ElevationIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 19.5h16" {...line} />
    <path d="M5.5 19.5v-6h13v6M12 13.5v6M5.5 4.5h13v4.5h-13ZM12 4.5V9" {...line} />
  </Svg>
);

/** "Uklopi": four corners drawn in */
export const FitIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" {...line} />
  </Svg>
);

/* ------------------------------------------------------------------ the 3D camera presets (ViewSwitch) and the ceiling */

/**
 * A camera preset of the 3D view: "studio" (a cube with an arrow around it — orbiting the kitchen), "prostorija" (an
 * eye — standing in the room), "frontalno" (a wall straight on), "odozgo" (a room from above, an arrow down)
 */
export function CameraGlyph({ preset, ...rest }: P & { preset: string }) {
  let body: ReactNode;
  switch (preset) {
    case "prostorija":
      body = (
        <>
          <path d="M3.5 12c2.2-3.6 5.1-5.4 8.5-5.4s6.3 1.8 8.5 5.4c-2.2 3.6-5.1 5.4-8.5 5.4S5.7 15.6 3.5 12Z" {...line} />
          <circle cx="12" cy="12" r="2.6" {...line} />
        </>
      );
      break;
    case "frontalno":
      body = (
        <>
          <path d="M4 19.5h16M5.5 19.5v-6.5h13v6.5M12 13v6.5" {...line} />
          <path d="M5.5 4.5h13V9h-13Z" {...line} />
        </>
      );
      break;
    case "odozgo":
      body = (
        <>
          <path d="M5 9.5v10h14v-10" {...line} />
          <path d="M7.5 12h9v5h-9Z" {...line} strokeOpacity={0.55} />
          <path d="M12 2.8v5.4M9.8 6l2.2 2.2L14.2 6" {...line} />
        </>
      );
      break;
    default:
      // a cube with an arrow around it
      body = (
        <>
          <path d="M12 3.8 16.6 6.4v5.2L12 14.2l-4.6-2.6V6.4Z" {...line} />
          <path d="M7.4 6.4 12 9l4.6-2.6M12 9v5.2" {...line} />
          <path d="M4 13.8c.4 2.8 3.9 5 8 5s7.6-2.2 8-5" {...line} />
          <path d="M17.7 18.9l2.2-.3-.7-2.1" {...line} />
        </>
      );
  }
  return <Svg {...rest}>{body}</Svg>;
}

/** the room's ceiling with a round light under it ("Strop") */
export const CeilingIcon = (props: P) => (
  <Svg {...props}>
    <path d="M3 5h18" {...line} />
    <path d="M12 5v3" {...line} />
    <path d="M7.5 11.5a4.5 3.5 0 0 1 9 0Z" {...line} />
    <path d="M9.6 14.6 8.6 16.4M12 15.2v2M14.4 14.6l1 1.8" {...line} strokeOpacity={0.6} />
  </Svg>
);

/**
 * A drawer unit's front split (catalog.drawerLayouts — shares top → bottom), drawn to scale; `mid` = the Gola channel
 * between the drawers (KitchenConfig.gola.between)
 */
export function DrawerSplitGlyph({ ratios, mid = false, ...rest }: P & { ratios: readonly number[]; mid?: boolean }) {
  const x0 = 8;
  const x1 = 24;
  const top = 5.5;
  const bottom = 27;
  const gap = mid ? 1.6 : 0.9;
  const H = bottom - top - gap * (ratios.length - 1);
  // each front starts below the ones above it (and their gaps)
  const fronts = ratios.map((r, i) => ({ y: top + ratios.slice(0, i).reduce((n, x) => n + x * H + gap, 0), h: r * H }));
  return (
    <Svg viewBox="0 0 32 32" {...rest}>
      <path d="M5 3.5h22" {...line} strokeOpacity={0.55} />
      {fronts.map((f, i) => (
        <g key={i}>
          <rect x={x0} y={f.y} width={x1 - x0} height={Math.max(0.6, f.h)} rx="0.6" {...line} />
          {mid && i > 0 && <rect x={x0} y={f.y - gap} width={x1 - x0} height={gap} fill="currentColor" fillOpacity={0.22} stroke="none" />}
        </g>
      ))}
    </Svg>
  );
}
