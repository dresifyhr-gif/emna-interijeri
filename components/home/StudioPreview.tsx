import { STEPS } from "@/components/studio/meta";
import { catalog, moduleDef } from "@/lib/studio/catalog";
import { estimate } from "@/lib/studio/price";
import { buildPoster } from "./posterGeometry";
import { HERO_CONFIG } from "./heroConfig";

/** the elements step of the studio, as the preview's side panel shows it */
const STEP = STEPS.findIndex((s) => s.id === "elementi");
const TILES = ["ladice", "vrata", "sudoper", "ploca", "perilica", "smece"];

const FACE: Record<string, string> = { front: "#232226", top: "#2b2a2e", side: "#1b1a1d" };
const STROKE: Record<string, { o: number; w: number }> = {
  face: { o: 0.7, w: 1 },
  line: { o: 0.45, w: 0.8 },
  faint: { o: 0.12, w: 0.8 },
  dim: { o: 0.8, w: 0.8 },
  led: { o: 0.9, w: 1 },
};

const eur = (n: number) => new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 }).format(n);

/**
 * A still of the 3D studio for the homepage's studio band: the hero kitchen as a line drawing (generated from the real
 * planner, like the hero's poster) with "+" places, and the studio's side panel on its elements step — real step
 * names, element names and the studio's rough price for this kitchen. Decorative: the band's text says the same.
 * Server component (the planner and the catalogue stay on the server).
 */
export function StudioPreview() {
  const p = buildPoster(HERO_CONFIG);
  const price = estimate(HERO_CONFIG);
  const tiles = TILES.map((id) => moduleDef("base", id)).filter((m) => m !== undefined);
  const front = catalog.fronts.find((f) => f.id === HERO_CONFIG.front);

  return (
    <div
      aria-hidden
      className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-white/[0.06] bg-[radial-gradient(ellipse_80%_70%_at_35%_45%,#232226_0%,#1b1a1d_55%,#161518_100%)] sm:aspect-[1.45]"
    >
      {/* the kitchen (phones: the side panel is hidden, so the drawing takes the whole width) */}
      <div className="absolute bottom-[14%] left-[5%] right-[5%] top-[8%] sm:bottom-[10%] sm:left-[3%] sm:right-[36%] sm:top-[12%]">
        <svg viewBox={p.viewBox} preserveAspectRatio="xMidYMid meet" className="h-full w-full overflow-visible" focusable="false">
          {p.shapes.map((sh, i) => {
            const st = STROKE[sh.kind] ?? STROKE.line;
            return (
              <path
                key={i}
                d={sh.d}
                fill={sh.kind === "face" ? FACE[sh.face ?? "front"] : "none"}
                stroke={sh.kind === "led" ? "#f4e7cd" : "#c9b99a"}
                strokeOpacity={st.o}
                strokeWidth={st.w}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {/* "+" places, as the studio shows them in empty spots */}
        <span className="absolute left-[14%] top-[47%] flex h-6 w-6 items-center justify-center rounded-full bg-white text-[14px] leading-none text-graphite shadow-[0_4px_12px_rgba(0,0,0,.35)]">
          +
        </span>
        <span className="absolute left-[36%] top-[16%] flex h-6 w-6 items-center justify-center rounded-full bg-white text-[14px] leading-none text-graphite shadow-[0_4px_12px_rgba(0,0,0,.35)]">
          +
        </span>
      </div>

      {/* the side panel */}
      <div className="absolute bottom-3 right-3 top-3 hidden w-[34%] flex-col rounded-2xl bg-white/[0.94] p-4 text-graphite shadow-[0_10px_30px_rgba(0,0,0,.25)] sm:flex lg:p-5">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-[3px] flex-1 rounded-full ${i <= STEP ? "bg-graphite" : "bg-hairline"}`} />
          ))}
        </div>
        <p className="kicker mt-4 text-[9.5px] text-taupe">
          Korak {STEP + 1} / {STEPS.length}
        </p>
        <p className="heading mt-2 text-[19px] tracking-head-sm lg:text-[21px]">{STEPS[STEP]?.title ?? "Elementi"}</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5 lg:gap-2">
          {tiles.map((m, i) => (
            <span
              key={m.id}
              className={`rounded-[10px] border bg-white p-2 text-[10px] leading-tight lg:text-[11px] ${i === 0 ? "border-graphite" : "border-hairline"}`}
            >
              <span className="mb-1.5 block h-5 rounded-[4px] bg-[linear-gradient(135deg,#f1ece4,#dcd2c3)] lg:h-6" />
              <span className="line-clamp-2">{m.name}</span>
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-[10.5px] leading-tight text-taupe">
            okvirno
            <span className="block font-head text-[14px] font-semibold tabular-nums text-graphite lg:text-[15px]">od {eur(price.low)} €</span>
          </span>
          <span className="rounded-full bg-graphite px-3 py-1.5 text-[11px] font-medium text-white">Dalje</span>
        </div>
      </div>

      {front && (
        <span className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-night-raise/90 px-3 py-1.5 text-[11px] text-fg/80">
          Fronta: {front.name}
        </span>
      )}
    </div>
  );
}
