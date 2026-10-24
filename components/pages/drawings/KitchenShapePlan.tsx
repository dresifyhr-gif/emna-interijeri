"use client";

import type { Shape } from "@/lib/gallery";
import { Dim, Drawing, P, T, circle, rect } from "./primitives";

const LABEL: Record<Shape, string> = {
  ravna: "Tlocrt ravne kuhinje uz jedan zid",
  L: "Tlocrt L-kuhinje uz dva susjedna zida",
  U: "Tlocrt U-kuhinje uz tri zida",
  otok: "Tlocrt kuhinje s otokom",
};

// plan geometry (viewBox 260 × 200, ~1.9 cm per unit)
const L0 = 40; // inner face of left wall
const R0 = 220; // inner face of right wall
const TOP = 40; // inner face of back wall
const D = 32; // counter depth (60 cm)

function hob(cx: number, cy: number, i: number) {
  return (
    <>
      <P d={rect(cx - 13, cy - 11, 26, 22)} i={i} soft />
      {[
        [-6, -5],
        [6, -5],
        [-6, 5],
        [6, 5],
      ].map(([dx, dy], k) => (
        <P key={k} d={circle(cx + dx, cy + dy, k === 0 ? 4 : 3.2)} i={i + 1} />
      ))}
    </>
  );
}

function sink(cx: number, cy: number, i: number, vertical = false) {
  const w = vertical ? 18 : 28;
  const h = vertical ? 28 : 18;
  return (
    <>
      <P d={rect(cx - w / 2, cy - h / 2, w, h)} i={i} />
      <P d={rect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6)} i={i + 1} soft />
      <P d={circle(cx, cy, 1.8)} i={i + 2} />
    </>
  );
}

/** Plan view (tlocrt) of one kitchen shape with walls, counters, sink, hob and dimensions. */
export function KitchenShapePlan({ shape, className = "" }: { shape: Shape; className?: string }) {
  const useLeft = shape === "L" || shape === "U";
  const useRight = shape === "U";
  const tall = shape !== "U";

  return (
    <Drawing viewBox="0 0 260 200" label={LABEL[shape]} className={className}>
      {/* walls: inner + outer face */}
      <P d={`M${L0} 192V${TOP}H${R0}V192`} i={0} soft />
      <P d={`M${L0 - 7} 192V${TOP - 7}H${R0 + 7}V192`} i={0} soft />

      {/* back run (wall a) */}
      <P d={rect(L0, TOP, R0 - L0, D)} i={1} />
      {tall && (
        <>
          <P d={rect(R0 - 26, TOP, 26, D + 2)} i={2} />
          <P d={`M${R0 - 26} ${TOP}L${R0} ${TOP + D + 2}M${R0} ${TOP}L${R0 - 26} ${TOP + D + 2}`} i={3} soft />
        </>
      )}

      {useLeft && <P d={rect(L0, TOP + D, D, 92)} i={2} />}
      {useRight && <P d={rect(R0 - D, TOP + D, D, 92)} i={3} />}

      {shape === "otok" && (
        <>
          <P d={rect(84, 116, 96, 44)} i={3} />
          <P d={`M84 150H180`} i={4} soft dashed />
        </>
      )}

      {/* sink on the back run, hob where it makes sense */}
      {sink(shape === "U" ? 130 : 118, TOP + D / 2, 4)}
      {shape === "ravna" && hob(168, TOP + D / 2, 5)}
      {shape === "L" && hob(L0 + D / 2, 128, 5)}
      {shape === "U" && hob(R0 - D / 2, 128, 5)}
      {shape === "otok" && hob(132, 134, 5)}

      {/* dimensions in cm */}
      <Dim x1={L0} y1={18} x2={R0} y2={18} label="380 cm" i={6} />
      {useLeft && <Dim x1={16} y1={TOP} x2={16} y2={TOP + D + 92} label="220 cm" i={7} />}
      {useRight && <Dim x1={244} y1={TOP} x2={244} y2={TOP + D + 92} label="220 cm" i={8} side={1} />}
      {shape === "otok" && <Dim x1={84} y1={176} x2={180} y2={176} label="240 cm" i={7} side={1} />}

      {shape === "otok" && (
        <T x={132} y={110} size={7} soft i={8}>
          ↔ 90–120 cm
        </T>
      )}
    </Drawing>
  );
}
