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

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M12.5 7A5.5 5.5 0 0 0 7 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
