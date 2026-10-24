"use client";

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { useMotionAllowed } from "@/components/ui/motion";
import type { DrawPath, ProcessDrawingData } from "./processDrawings";
import type { Label } from "./drawingKit";

const FILL = { front: "#0e0e10", top: "#151517", side: "#0a0a0b" } as const;

const STROKE: Record<DrawPath["kind"], { w: number; o: number; color?: string; dash?: string }> = {
  solid: { w: 1, o: 0.85 },
  line: { w: 0.8, o: 0.55 },
  faint: { w: 0.8, o: 0.22 },
  dash: { w: 0.8, o: 0.7, dash: "3 3" },
  dim: { w: 0.8, o: 0.95 },
  accent: { w: 1.1, o: 1, color: "#E6D8BC" },
};

/**
 * Technical drawing that draws itself as it scrolls through the viewport (stroke pathLength tied to
 * scroll progress — scroll back up and it un-draws). Static and complete for reduced motion.
 */
export function ProcessDrawing({ data, label }: { data: ProcessDrawingData; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // server HTML and hydration: the finished, still drawing; the scroll-linked one only after mount, never with reduced motion
  const still = !useMotionAllowed();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 92%", "start 32%"] });
  const n = data.paths.length;

  return (
    <div ref={ref} className="h-full w-full">
      <svg
        viewBox={data.viewBox}
        role="img"
        aria-label={label}
        className="h-full w-full overflow-visible text-accent"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {data.paths.map((p, i) => {
          const from = (i / Math.max(1, n)) * 0.55;
          return <Stroke key={i} path={p} progress={scrollYProgress} from={from} to={from + 0.45} still={still} />;
        })}
        {data.labels.map((l, i) => (
          <LabelText key={`l${i}`} label={l} progress={scrollYProgress} still={still} />
        ))}
      </svg>
    </div>
  );
}

function Stroke({ path, progress, from, to, still }: { path: DrawPath; progress: MotionValue<number>; from: number; to: number; still: boolean }) {
  const len = useTransform(progress, [from, to], [0, 1]);
  const appear = useTransform(progress, [from, from + 0.03], [0, 1]);
  const fade = useTransform(progress, [from, to], [0, 1]);
  const st = STROKE[path.kind];
  const common = {
    d: path.d,
    stroke: st.color ?? "currentColor",
    strokeWidth: st.w,
    strokeOpacity: st.o,
    fill: path.kind === "solid" ? FILL[path.face ?? "front"] : "none",
  };
  if (still) return <path {...common} strokeDasharray={st.dash} />;
  // dashed lines cannot also be drawn with a dash offset: they fade in instead
  if (st.dash) return <motion.path {...common} strokeDasharray={st.dash} style={{ opacity: fade }} />;
  return <motion.path {...common} style={{ pathLength: len, opacity: appear, fillOpacity: path.kind === "solid" ? fade : 0 }} />;
}

function LabelText({ label, progress, still }: { label: Label; progress: MotionValue<number>; still: boolean }) {
  const opacity = useTransform(progress, [0.72, 1], [0, 1]);
  const common = {
    x: label.x,
    y: label.y,
    textAnchor: "middle" as const,
    fill: "currentColor",
    stroke: "none",
    className: "font-display text-[9px] tracking-[0.16em]",
  };
  return (
    <g transform={`rotate(${label.rot} ${label.x} ${label.y})`}>
      {/* a plain <text> when still, so no scroll-driven opacity is left behind */}
      {still ? (
        <text {...common}>{label.text}</text>
      ) : (
        <motion.text {...common} style={{ opacity }}>
          {label.text}
        </motion.text>
      )}
    </g>
  );
}
