import s from "./studio.module.css";

/**
 * The "drawing table" shown while three.js loads: a kitchen elevation in thin accent lines and a
 * slow loading hairline. Server-safe (no hooks) so it doubles as the Suspense fallback of /studio.
 */
export function StudioLoader({ label = "Pripremamo 3D prikaz" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center px-6 text-center">
      <svg viewBox="0 0 168 84" aria-hidden="true" className="h-[84px] w-[168px] text-accent">
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
          {/* wall units */}
          <path d="M14 10h92v22H14Z" strokeOpacity=".55" />
          <path d="M37 10v22M60 10v22M83 10v22" strokeOpacity=".35" />
          {/* tall column */}
          <path d="M118 10h36v64h-36Z" strokeOpacity=".55" />
          <path d="M136 10v64M118 40h36" strokeOpacity=".35" />
          {/* worktop + base units */}
          <path d="M8 44h104" />
          <path d="M14 47h98v24H14Z" strokeOpacity=".55" />
          <path d="M40 47v24M66 47v24M89 47v24M14 55h26M14 63h26" strokeOpacity=".35" />
          {/* floor + dimension line */}
          <path d="M2 74h164" strokeOpacity=".3" />
          <path d="M14 80h140M14 77.5v5M154 77.5v5" strokeOpacity=".45" />
        </g>
      </svg>
      <p className="eyebrow mt-7 text-accent">3D studio</p>
      <p className="mt-3 font-display text-[22px] font-medium tracking-tight text-fg">{label}</p>
      <div className="relative mt-6 h-px w-44 overflow-hidden bg-white/10" role="progressbar" aria-label={label}>
        <span className={`${s.loadbar} absolute inset-y-0 left-0 w-1/3 bg-accent`} />
      </div>
    </div>
  );
}

/** full-screen variant for the route's Suspense boundary */
export function StudioFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink">
      <StudioLoader />
    </div>
  );
}
