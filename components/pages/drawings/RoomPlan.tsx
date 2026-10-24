"use client";

import { Callout, Dim, Drawing, P, T, arc, rect } from "./primitives";

const win = (x: number, w: number, i: number) => <P d={`${rect(x, 40, w, 8)}M${x} 44H${x + w}`} i={i} />;

/**
 * Illustrative floor plan (tlocrt) of a flat furnished end to end — 1 unit = 2 cm.
 * Not a real project: a drawing that shows what "interijer po mjeri" covers.
 */
export function RoomPlan({ trigger = "view", className = "" }: { trigger?: "view" | "mount"; className?: string }) {
  return (
    <Drawing
      viewBox="0 0 640 440"
      trigger={trigger}
      className={className}
      label="Ilustrativni tlocrt stana: kuhinja s otokom, dnevni boravak s TV zidom, spavaća soba s ormarom, hodnik s ulaznim ormarom i radna soba"
    >
      {/* outer walls with entrance gap */}
      <P d="M40 40H600V400H344M300 400H40V40" i={0} soft />
      <P d="M48 48H592V392H344M300 392H48V48M300 392V400M344 392V400" i={0} soft />
      {win(120, 80, 1)}
      {win(270, 80, 1)}
      {win(456, 80, 1)}
      <P d={`${rect(592, 290, 8, 60)}M596 290V350`} i={1} />

      {/* interior walls */}
      <P
        d={`${rect(48, 248, 152, 4)}${rect(300, 248, 96, 4)}${rect(440, 248, 152, 4)}${rect(380, 48, 4, 200)}${rect(
          170,
          252,
          4,
          48,
        )}${rect(170, 336, 4, 56)}${rect(450, 252, 4, 38)}${rect(450, 330, 4, 62)}`}
        i={2}
        soft
      />

      {/* doors */}
      <P d="M300 392V348M396 248V204M170 300H134M454 290H494" i={3} soft />
      <P d={arc(300, 392, 44, -90, 0)} i={3} soft dashed />
      <P d={arc(396, 248, 44, -90, 0)} i={3} soft dashed />
      <P d={arc(170, 300, 36, 90, 180)} i={3} soft dashed />
      <P d={arc(454, 290, 40, 0, 90)} i={3} soft dashed />

      {/* 01 kitchen: L run + tall column + island */}
      <P d={`${rect(48, 48, 212, 30)}${rect(48, 78, 30, 122)}`} i={4} />
      <P d={`${rect(232, 48, 28, 32)}M232 48L260 80M260 48L232 80`} i={5} soft />
      <P d={rect(120, 130, 100, 44)} i={5} />

      {/* 02 living: TV wall, sofa, table */}
      <P d={rect(362, 70, 18, 150)} i={6} />
      <P d={`${rect(272, 96, 40, 118)}M282 96V214`} i={7} soft />
      <P d={rect(326, 130, 22, 50)} i={7} soft />

      {/* 03 bedroom: bed, nightstands, wardrobe */}
      <P d={`${rect(440, 56, 104, 116)}M440 70H544`} i={6} soft />
      <P d={`${rect(414, 56, 22, 22)}${rect(548, 56, 22, 22)}`} i={7} soft />
      <P d={`${rect(456, 214, 136, 34)}M490 214V248M524 214V248M558 214V248`} i={7} />

      {/* 04 hall: entrance wardrobe + bench */}
      <P d={`${rect(196, 362, 96, 30)}M244 362V392`} i={8} />
      <P d={rect(354, 370, 64, 22)} i={8} soft />

      {/* 05 study: desk + shelves; bathroom vanity */}
      <P d={`${rect(548, 270, 44, 100)}${rect(470, 370, 72, 22)}`} i={9} />
      <P d={rect(56, 258, 60, 24)} i={9} soft />

      {/* room names */}
      <T x={130} y={228} size={8} spacing={2} soft i={10}>
        KUHINJA
      </T>
      <T x={292} y={234} size={8} spacing={2} soft i={10}>
        DNEVNI BORAVAK
      </T>
      <T x={396} y={192} size={8} spacing={1.6} soft i={10} anchor="start">
        SPAVAĆA SOBA
      </T>
      <T x={310} y={300} size={8} spacing={2} soft i={10}>
        HODNIK
      </T>
      <T x={500} y={354} size={8} spacing={1.6} soft i={10}>
        RADNA SOBA
      </T>
      <T x={110} y={340} size={8} spacing={2} soft i={10}>
        KUPAONICA
      </T>

      {/* overall dimensions */}
      <Dim x1={40} y1={20} x2={600} y2={20} label="1120 cm" i={11} />
      <Dim x1={18} y1={40} x2={18} y2={400} label="720 cm" i={11} />

      {/* callouts */}
      <Callout x={244} y={104} tx={214} ty={78} n="01" i={12} />
      <Callout x={340} y={96} tx={362} ty={110} n="02" i={12.4} />
      <Callout x={520} y={192} tx={520} ty={214} n="03" i={12.8} />
      <Callout x={244} y={334} tx={244} ty={362} n="04" i={13.2} />
      <Callout x={516} y={322} tx={548} ty={322} n="05" i={13.6} />
    </Drawing>
  );
}
