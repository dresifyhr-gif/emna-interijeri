"use client";

import type { JSX } from "react";
import { Drawing, P, arc, arrowHead, circle, polar, rect } from "./primitives";

export type MechanismId = "ladice" | "klapne" | "karusel" | "smocnica" | "dodir";

const LABEL: Record<MechanismId, string> = {
  ladice: "Presjek donjeg elementa s izvučenom ladicom",
  klapne: "Presjek gornjeg elementa s klapnom podignutom prema gore",
  karusel: "Tlocrt kutnog elementa s okretnim policama",
  smocnica: "Bočni prikaz visoke izvlačne smočnice",
  dodir: "Fronta bez ručke koja se otvara pritiskom",
};

function Ladice() {
  return (
    <>
      <P d={rect(44, 12, 60, 74)} i={0} soft />
      {/* closed drawers */}
      <P d={rect(40, 14, 4, 20)} i={1} />
      <P d={rect(44, 18, 54, 14)} i={2} soft />
      <P d={rect(40, 64, 4, 20)} i={1} />
      <P d={rect(44, 68, 54, 14)} i={2} soft />
      {/* open drawer, pulled out */}
      <P d={rect(10, 38, 4, 22)} i={2} />
      <P d={rect(14, 42, 54, 16)} i={3} />
      <P d={`M68 50H98`} i={4} soft dashed />
      {/* motion arrow */}
      <P d={`M14 92H32`} i={5} soft />
      <P d={arrowHead(34, 92, 0, 5)} i={5} />
    </>
  );
}

function Klapne() {
  const [ex, ey] = polar(62, 30, 50, 200);
  const [qx, qy] = polar(62 + 1.4, 30 - 3.8, 50, 200);
  return (
    <>
      <P d={rect(62, 30, 50, 50)} i={0} soft />
      <P d={`M62 55H112`} i={1} soft />
      {/* closed position, dashed */}
      <P d={rect(58, 30, 4, 50)} i={1} soft dashed />
      {/* lifted flap */}
      <P d={`M62 30L${ex} ${ey}L${qx} ${qy}L63.4 26.2Z`} i={2} />
      {/* swing path */}
      <P d={arc(62, 30, 50, 90, 196)} i={3} soft dashed />
      <P d={circle(62, 30, 2)} i={3} />
    </>
  );
}

function Karusel() {
  const cx = 58;
  const cy = 50;
  return (
    <>
      {/* walls */}
      <P d={`M10 8H110M10 8V92`} i={0} soft w={2} />
      {/* corner carcass (L in plan) */}
      <P d={`M14 12H104V44H50V88H14Z`} i={1} soft />
      {/* three-quarter tray */}
      <P d={`M${cx} ${cy}L${cx + 26} ${cy}A26 26 0 1 0 ${cx} ${cy + 26}Z`} i={2} />
      <P d={circle(cx, cy, 2)} i={3} />
      {/* rotation */}
      <P d={arc(cx, cy, 33, 150, 245)} i={4} soft />
      <P d={arrowHead(...polar(cx, cy, 33, 245), 335, 5)} i={4} />
    </>
  );
}

function Smocnica() {
  return (
    <>
      <P d={rect(56, 6, 48, 84)} i={0} soft />
      <P d={`M104 6V90`} i={0} soft />
      {/* pulled-out frame */}
      <P d={rect(14, 8, 4, 80)} i={1} />
      <P d={`M18 10V86M62 10V86`} i={2} />
      {[22, 38, 54, 70].map((y, k) => (
        <P key={y} d={`M18 ${y}H62V${y - 6}`} i={3 + k * 0.4} />
      ))}
      <P d={`M62 48H100`} i={4} soft dashed />
      <P d={`M16 94H34`} i={5} soft />
      <P d={arrowHead(14, 94, 180, 5)} i={5} />
    </>
  );
}

function Dodir() {
  return (
    <>
      <P d={rect(30, 6, 58, 84)} i={0} />
      <P d={rect(34, 10, 50, 76)} i={1} soft />
      {/* push point + ripples */}
      <P d={circle(74, 48, 2.2)} i={2} fill="currentColor" />
      <P d={arc(74, 48, 8, 300, 420)} i={3} soft />
      <P d={arc(74, 48, 14, 305, 415)} i={4} soft />
      {/* door opening a little, in section above */}
      <P d={`M30 94H88`} i={5} soft dashed />
    </>
  );
}

const ART: Record<MechanismId, () => JSX.Element> = {
  ladice: Ladice,
  klapne: Klapne,
  karusel: Karusel,
  smocnica: Smocnica,
  dodir: Dodir,
};

export function MechanismDrawing({ id, className = "" }: { id: MechanismId; className?: string }) {
  return (
    <Drawing viewBox="0 0 120 100" label={LABEL[id]} className={className} strokeWidth={1.3}>
      {ART[id]()}
    </Drawing>
  );
}
