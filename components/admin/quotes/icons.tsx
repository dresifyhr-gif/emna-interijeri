/** extra thin-line icons for the quotes screens (same drawing rules as components/admin/ui/icons.tsx) */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
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

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 16V4M5 9l5-5 5 5" />
  </Svg>
);

export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M5 11l5 5 5-5" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
    <path d="M13 7V4.75a1.25 1.25 0 0 0-1.25-1.25h-7A1.25 1.25 0 0 0 3.5 4.75v7A1.25 1.25 0 0 0 4.75 13H7" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.25 5.5l.7 10.1a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-10.1M8.5 9v5M11.5 9v5" />
  </Svg>
);

export const IconPrint = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 7.5V3h9v4.5M5.5 14.5H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h12A1.5 1.5 0 0 1 17.5 9v4a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
    <path d="M5.5 11.5h9V17h-9z" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5" />
    <path d="m3.5 5.5 6.5 5 6.5-5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 10.5 4 4 8-9" />
  </Svg>
);

export const IconDuplicate = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
    <path d="M13.5 6.5V4.75a1.25 1.25 0 0 0-1.25-1.25h-7.5A1.25 1.25 0 0 0 3.5 4.75v7.5a1.25 1.25 0 0 0 1.25 1.25H6.5M11.5 9.5v4M9.5 11.5h4" />
  </Svg>
);
