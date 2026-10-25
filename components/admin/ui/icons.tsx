/** thin-line icons for the admin (1.4 stroke, 20×20, currentColor) */
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

export const IconOverview = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="2.75" width="6" height="7.5" rx="1" />
    <rect x="11.25" y="2.75" width="6" height="4.5" rx="1" />
    <rect x="11.25" y="9.75" width="6" height="7.5" rx="1" />
    <rect x="2.75" y="12.75" width="6" height="4.5" rx="1" />
  </Svg>
);

export const IconInbox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 11.5 5 4.25h10l2.25 7.25v4.25a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1V11.5Z" />
    <path d="M2.75 11.5h4.5l.75 2h4l.75-2h4.5" />
  </Svg>
);

export const IconQuote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.75h7l3.25 3.25v10.25a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
    <path d="M11.75 2.75V6.25h3.5M7 10h6M7 13h4" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5.5h8M14 5.5h3M3 14.5h3M9 14.5h8" />
    <circle cx="12.5" cy="5.5" r="1.75" />
    <circle cx="7.5" cy="14.5" r="1.75" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.25H4.75a1 1 0 0 0-1 1v11.5a1 1 0 0 0 1 1H8M12.5 6.5 16 10l-3.5 3.5M16 10H7.5" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 4H4.75a1 1 0 0 0-1 1v10.25a1 1 0 0 0 1 1H15a1 1 0 0 0 1-1V11.5M11.5 3.75h4.75V8.5M16 4 9.5 10.5" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h14M3 10h14M3 14h9" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.75 10S4.75 4.25 10 4.25 18.25 10 18.25 10 15.25 15.75 10 15.75 1.75 10 1.75 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l14 14M8.2 4.45A8 8 0 0 1 10 4.25C15.25 4.25 18.25 10 18.25 10a14 14 0 0 1-2.3 3.05M12.1 15.4a7.6 7.6 0 0 1-2.1.35C4.75 15.75 1.75 10 1.75 10a14.4 14.4 0 0 1 3.1-3.8M8.25 8.25a2.5 2.5 0 0 0 3.5 3.5" />
  </Svg>
);
