/** extra thin-line icons for the Upiti / Postavke screens (same grid and stroke as ui/icons) */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 2.75H4.1a1.1 1.1 0 0 0-1.1 1.2c.6 7 5.95 12.35 12.95 12.95a1.1 1.1 0 0 0 1.2-1.1v-2.1a1 1 0 0 0-.75-.97l-2.6-.66a1 1 0 0 0-.98.3l-.9.98a9.6 9.6 0 0 1-4.55-4.55l.98-.9a1 1 0 0 0 .3-.98l-.66-2.6a1 1 0 0 0-.97-.75Z" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.25" />
    <path d="m3.25 5 6.75 5.5L16.75 5" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.75a7.25 7.25 0 0 0-6.3 10.83L2.75 17.25l3.8-.93A7.25 7.25 0 1 0 10 2.75Z" />
    <path d="M7.25 8.5c.2 1.7 2.05 3.6 3.9 4 .55.1 1.1-.2 1.35-.7l.25-.5-1.5-.85-.6.6c-.6-.25-1.2-.85-1.45-1.45l.6-.6-.85-1.5-.5.25c-.5.25-.8.8-.7 1.35" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.75" y="6.75" width="10.5" height="10.5" rx="1.25" />
    <path d="M13.25 6.75V4a1.25 1.25 0 0 0-1.25-1.25H4A1.25 1.25 0 0 0 2.75 4v8A1.25 1.25 0 0 0 4 13.25h2.75" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 10.5 3.75 3.75L16 6" />
  </Svg>
);

export const IconCube = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 2.75 6.5 3.6v7.3L10 17.25l-6.5-3.6v-7.3L10 2.75Z" />
    <path d="M3.5 6.35 10 10l6.5-3.65M10 10v7.25" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="3.25" width="14.5" height="4" rx="1" />
    <path d="M4 7.25v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5M8 10.5h4" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V3.75h4V5.5M5 5.5l.8 10.8a1 1 0 0 0 1 .95h6.4a1 1 0 0 0 1-.95L15 5.5M8.25 8.75v5.5M11.75 8.75v5.5" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.75" cy="8.75" r="5.5" />
    <path d="m13 13 4.25 4.25" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10h14m0 0-5.5-5.5M17 10l-5.5 5.5" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.25" />
    <circle cx="7.25" cy="8" r="1.5" />
    <path d="m3 14.5 4.25-4 3 2.75 2.5-2.25 4.25 3.75" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v10m0 0-4-4m4 4 4-4M3.5 16.75h13" />
  </Svg>
);
