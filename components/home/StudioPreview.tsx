import { ModuleGlyph } from "@/components/studio/icons";
import { STEPS } from "@/components/studio/meta";
import { catalog, moduleDef } from "@/lib/studio/catalog";
import { planKitchen } from "@/lib/studio/plan";
import { estimate } from "@/lib/studio/price";
import { buildPoster } from "./posterGeometry";
import { HERO_CONFIG } from "./heroConfig";

/** the elements step of the studio, as the preview's side panel shows it */
const STEP = STEPS.findIndex((s) => s.id === "elementi");
/** how many element rows the panel lists (wall A's base cabinets, left → right — as the real "Elementi" step does) */
const ROWS = 5;

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
 * planner, like the hero's poster) with "+" places, and the studio's side panel on its elements step as the studio
 * shows it — the same dark glass panel, step bars, "Korak 03 / 06", the element rows of wall A (names and widths from
 * the planner, the first one selected) and the rough price for this kitchen. Decorative: the band's text says the same.
 * Server component (the planner and the catalogue stay on the server).
 */
export function StudioPreview() {
  const p = buildPoster(HERO_CONFIG);
  const price = estimate(HERO_CONFIG);
  const rows = planKitchen(HERO_CONFIG)
    .slots.filter((s) => s.run === "a" && s.zone === "base" && !moduleDef(s.zone, s.type)?.spacer)
    .sort((a, b) => a.x - b.x)
    .slice(0, ROWS)
    .map((s) => ({ id: s.id, type: s.type, name: moduleDef(s.zone, s.type)?.name ?? s.type, width: Math.round(s.width) }));
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

      {/* the side panel — the studio's own: dark glass, accent step bar, element rows, price and "Dalje" */}
      <div className="glass absolute bottom-3 right-3 top-3 hidden w-[34%] flex-col overflow-hidden rounded-[20px] p-4 text-fg shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] sm:flex lg:p-5">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-[2px] flex-1 rounded-full ${i === STEP ? "bg-accent" : i < STEP ? "bg-fg/45" : "bg-white/[0.1]"}`} />
          ))}
        </div>
        <p className="mt-4 text-[9.5px] font-medium uppercase tabular-nums tracking-[0.2em] text-mut">
          Korak {String(STEP + 1).padStart(2, "0")} <span className="text-mut/50">/ {String(STEPS.length).padStart(2, "0")}</span>
        </p>
        <p className="mt-2 font-head text-[19px] font-medium leading-tight tracking-tight lg:text-[22px]">{STEPS[STEP]?.title ?? "Elementi"}</p>
        <p className="mt-3 flex items-center gap-2 text-[8.5px] font-medium uppercase tracking-[0.2em] text-mut lg:text-[9px]">
          <span className="h-px w-4 bg-accent/60" />
          Donji elementi
        </p>
        <div className="mt-2 space-y-1 lg:space-y-1.5">
          {rows.map((r, i) => (
            <span
              key={r.id}
              className={`flex items-center gap-2 rounded-[9px] border px-1.5 py-1 text-[10px] leading-tight lg:text-[10.5px] ${
                i === 0 ? "border-accent/60 bg-accent/[0.08] text-fg" : "border-white/[0.07] text-fg/80"
              }`}
            >
              <ModuleGlyph type={r.type} zone="base" className={`h-5 w-5 shrink-0 lg:h-6 lg:w-6 ${i === 0 ? "text-accent" : "text-fg/55"}`} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums text-mut">{r.width} cm</span>
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-white/10 pt-3">
          <span className="text-[10.5px] leading-tight text-mut">
            okvirno
            <span className="block font-head text-[14px] font-semibold tabular-nums text-fg lg:text-[15px]">od {eur(price.low)} €</span>
          </span>
          <span className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold tracking-wide text-ink">Dalje</span>
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
