"use client";

import type { JSX } from "react";
import { Callout, Dim, Drawing, P, arc, arrowHead, rect } from "./primitives";

/* ------------------------------------------------------------------ */
/* Elevation (pogled) of a floor-to-ceiling wardrobe, 1 unit = 1 cm    */
/* ------------------------------------------------------------------ */

const X0 = 110; // left edge
const X1 = 430; // right edge (320 cm)
const CEIL = 50;
const FLOOR = 310; // 260 cm

function hatch(y: number, dir: -1 | 1, i: number) {
  let d = "";
  for (let x = 34; x <= 526; x += 14) d += `M${x} ${y}l8 ${dir * 8}`;
  return <P d={d} i={i} soft w={0.8} />;
}

const garments = [
  { x: 228, l: 104 },
  { x: 245, l: 84 },
  { x: 262, l: 112 },
  { x: 279, l: 72 },
  { x: 296, l: 96 },
];

export function WardrobeElevation({
  annotated = false,
  trigger = "view",
  className = "",
}: {
  annotated?: boolean;
  trigger?: "view" | "mount";
  className?: string;
}) {
  return (
    <Drawing
      viewBox="0 0 560 400"
      trigger={trigger}
      className={className}
      label="Tehnički crtež ugradbenog ormara od poda do stropa, širine 320 i visine 260 centimetara, s otvorenom unutrašnjošću"
    >
      {/* ceiling and floor with hatching */}
      <P d={`M30 ${CEIL}H530`} i={0} soft />
      {hatch(CEIL - 8, 1, 0)}
      <P d={`M30 ${FLOOR}H530`} i={0} soft />
      {hatch(FLOOR, 1, 0)}

      {/* carcass */}
      <P d={rect(X0, CEIL, X1 - X0, FLOOR - CEIL)} i={1} />
      <P d={`M${X0} ${FLOOR - 10}H${X1}`} i={2} soft />
      <P d={`M210 ${CEIL}V${FLOOR - 10}M320 ${CEIL}V${FLOOR - 10}`} i={2} />
      <P d={`M${X0} 92H${X1}`} i={3} />

      {/* section 1: closed doors */}
      <P d={`M160 ${CEIL}V${FLOOR - 10}`} i={4} />
      <P d={`M155 182V206M165 182V206`} i={5} soft />
      {/* opening symbols: apex on the hinge side */}
      <P d={`M160 ${CEIL}L${X0} 71L160 92M160 ${CEIL}L210 71L160 92`} i={6} soft dashed />
      <P d={`M160 92L${X0} 196L160 300M160 92L210 196L160 300`} i={6} soft dashed />

      {/* section 2: LED, rod, garments, drawers */}
      <P d={`M216 97H314`} i={5} soft dashed />
      <P d={`M214 110H316`} i={5} />
      {garments.map((g, k) => (
        <g key={g.x}>
          <P d={`M${g.x} 110v4l-8 7h16l-8-7`} i={6 + k * 0.25} />
          <P d={rect(g.x - 6, 122, 12, g.l)} i={7 + k * 0.25} soft />
        </g>
      ))}
      <P d={`M210 234H320`} i={6} />
      {[238, 259, 280].map((y, k) => (
        <g key={y}>
          <P d={rect(215, y, 100, 18)} i={7 + k * 0.3} />
          <P d={`M255 ${y + 5}H275`} i={8 + k * 0.3} soft />
        </g>
      ))}

      {/* section 3: shelves, folded stacks, shoe racks */}
      {[134, 176, 218].map((y, k) => (
        <g key={y}>
          <P d={`M320 ${y}H430`} i={5 + k * 0.3} />
          <P d={`${rect(330, y - 14, 34, 14)}${rect(372, y - 10, 30, 10)}`} i={6 + k * 0.3} soft />
        </g>
      ))}
      <P d={`M322 262L428 252M322 290L428 280`} i={7} />
      <P d={`M336 258q8-7 16 0M376 254q8-7 16 0M342 286q8-7 16 0M384 282q8-7 16 0`} i={8} soft />

      {/* dimensions */}
      <Dim x1={X0} y1={annotated ? 376 : 344} x2={X1} y2={annotated ? 376 : 344} label="320 cm" i={9} side={1} />
      <Dim x1={annotated ? 22 : 74} y1={CEIL} x2={annotated ? 22 : 74} y2={FLOOR} label="260 cm" i={10} />
      {!annotated && (
        <>
          <Dim x1={X0} y1={24} x2={210} y2={24} label="100" i={11} size={8} />
          <Dim x1={210} y1={24} x2={320} y2={24} label="110" i={11} size={8} />
          <Dim x1={320} y1={24} x2={X1} y2={24} label="110" i={11} size={8} />
        </>
      )}

      {annotated && (
        <>
          <Callout x={492} y={72} tx={404} ty={72} n="01" i={11} />
          <Callout x={240} y={20} tx={240} ty={97} n="02" i={11.5} />
          <Callout x={292} y={20} tx={292} ty={110} n="03" i={12} />
          <Callout x={492} y={176} tx={418} ty={176} n="04" i={12.5} />
          <Callout x={265} y={346} tx={265} ty={268} n="05" i={13} />
          <Callout x={492} y={272} tx={420} ty={268} n="06" i={13.5} />
          <Callout x={58} y={196} tx={134} ty={196} n="07" i={14} />
        </>
      )}
    </Drawing>
  );
}

/* ------------------------------------------------------------------ */
/* Small elevations / plans for the wardrobe types list                */
/* ------------------------------------------------------------------ */

export type WardrobeTypeId = "ugradbeni" | "klizni" | "garderoba" | "kosina" | "hodnik" | "otvoreni";

const TYPE_LABEL: Record<WardrobeTypeId, string> = {
  ugradbeni: "Ugradbeni ormar od poda do stropa",
  klizni: "Ormar s kliznim vratima",
  garderoba: "Tlocrt garderobe s policama uz tri zida",
  kosina: "Ormar ispod kosog stropa",
  hodnik: "Ulazni ormar s klupom",
  otvoreni: "Otvoreni sustav polica i šipki",
};

function Ugradbeni() {
  return (
    <>
      <P d="M6 8H114M6 92H114" i={0} soft />
      <P d={rect(18, 8, 84, 84)} i={1} />
      <P d="M18 24H102M46 8V92M74 8V92" i={2} />
      <P d="M43 50V60M49 50V60M71 50V60M77 50V60" i={3} soft />
    </>
  );
}

function Klizni() {
  return (
    <>
      <P d={rect(14, 8, 92, 82)} i={0} soft />
      <P d={rect(18, 12, 46, 74)} i={1} />
      <P d={rect(58, 14, 44, 70)} i={2} />
      <P d="M40 97H80" i={3} soft />
      <P d={`${arrowHead(38, 97, 180, 4)}${arrowHead(82, 97, 0, 4)}`} i={3} />
    </>
  );
}

function Garderoba() {
  return (
    <>
      <P d="M50 92H8V8H112V92H70" i={0} soft w={2} />
      <P d={`${rect(12, 12, 96, 16)}${rect(12, 28, 16, 58)}${rect(92, 28, 16, 58)}`} i={1} />
      <P d="M16 20H104M20 32V82M100 32V82" i={2} soft dashed />
      <P d="M50 92V72" i={3} />
      <P d={arc(50, 92, 20, -90, 0)} i={3} soft dashed />
    </>
  );
}

function Kosina() {
  return (
    <>
      <P d="M6 92H114M6 70L60 8H114" i={0} soft />
      <P d="M18 92V60L56 16.4H102V92Z" i={1} />
      <P d="M40 35V92M72 16.4V92" i={2} />
      <P d="M37 62V70M43 62V70M69 54V62M75 54V62" i={3} soft />
    </>
  );
}

function Hodnik() {
  return (
    <>
      <P d="M6 92H114" i={0} soft />
      <P d={rect(14, 8, 40, 84)} i={1} />
      <P d={rect(20, 16, 28, 50)} i={2} soft />
      <P d={`${rect(58, 56, 48, 8)}${rect(58, 64, 48, 28)}`} i={2} />
      <P d="M58 78H106" i={3} soft />
      <P d="M68 26v6M82 26v6M96 26v6" i={3} />
    </>
  );
}

function Otvoreni() {
  return (
    <>
      <P d="M6 92H114" i={0} soft />
      <P d="M18 8V92M60 8V92M102 8V92M18 8H102" i={1} />
      <P d="M60 34H102M60 58H102M60 80H102" i={2} />
      <P d="M20 24H58" i={2} />
      {[28, 39, 50].map((x, k) => (
        <g key={x}>
          <P d={`M${x} 24v3l-5 5h10l-5-5`} i={3 + k * 0.3} />
          <P d={rect(x - 4, 33, 8, 34 + k * 6)} i={4 + k * 0.3} soft />
        </g>
      ))}
    </>
  );
}

const TYPES: Record<WardrobeTypeId, () => JSX.Element> = {
  ugradbeni: Ugradbeni,
  klizni: Klizni,
  garderoba: Garderoba,
  kosina: Kosina,
  hodnik: Hodnik,
  otvoreni: Otvoreni,
};

export function WardrobeTypeDrawing({ id, className = "" }: { id: WardrobeTypeId; className?: string }) {
  return (
    <Drawing viewBox="0 0 120 100" label={TYPE_LABEL[id]} className={className} strokeWidth={1.3}>
      {TYPES[id]()}
    </Drawing>
  );
}
