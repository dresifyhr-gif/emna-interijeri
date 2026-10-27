import { buildPoster } from "./posterGeometry";
import { HERO_CONFIG } from "./heroConfig";
import s from "./home.module.css";

const FACE_CLASS = { front: s.faceFront, top: s.faceTop, side: s.faceSide } as const;
const KIND_CLASS = { line: s.line, faint: s.faint, dim: s.dim } as const;

/**
 * Dark poster shown while the 3D engine loads, and instead of it when WebGL is missing, the visitor
 * prefers reduced motion or saves data: the same kitchen as a thin accent line drawing that draws itself
 * (pure CSS, so it already moves before hydration). Server component — the planner runs on the server.
 */
export function HeroPoster() {
  const p = buildPoster(HERO_CONFIG);
  const [vx, vy, vw, vh] = p.viewBox.split(" ").map(Number);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-night">
      <div className={`absolute inset-0 ${s.posterGlow}`} />
      <div className={`absolute inset-0 ${s.posterGrid}`} />
      <div className={s.posterBox}>
        <svg viewBox={p.viewBox} preserveAspectRatio="xMidYMid meet" className={s.poster} focusable="false">
          <defs>
            <filter id="emna-hero-led" filterUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>
          {p.shapes.map((sh, i) => {
            const style = { animationDelay: `${sh.delay}s` };
            if (sh.kind === "face") {
              return <path key={i} d={sh.d} pathLength={1} className={`${s.face} ${FACE_CLASS[sh.face ?? "front"]}`} style={style} />;
            }
            if (sh.kind === "led") {
              return (
                <g key={i}>
                  <path d={sh.d} className={s.ledGlow} filter="url(#emna-hero-led)" strokeOpacity={0.55} style={style} />
                  <path d={sh.d} className={s.led} style={style} />
                </g>
              );
            }
            return <path key={i} d={sh.d} pathLength={1} className={KIND_CLASS[sh.kind]} style={style} />;
          })}
          {p.labels.map((l, i) => (
            <text
              key={`l${i}`}
              x={l.x}
              y={l.y}
              transform={`rotate(${l.rot} ${l.x} ${l.y})`}
              textAnchor="middle"
              className={`font-head ${s.label}`}
              style={{ animationDelay: `${l.delay}s` }}
            >
              {l.text}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
