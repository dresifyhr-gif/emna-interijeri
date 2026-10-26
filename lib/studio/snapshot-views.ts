/**
 * The camera presets of StudioEngineApi.snapshotViews (the PDF export's pictures), with their Croatian captions.
 * Pure data, no three.js: a UI can caption pictures without loading the engine. Kept out of ./types on purpose (that
 * file is in the homepage's and the studio's first-load JS): only the lazily loaded engine imports it, so it ships inside
 * the engine's chunk — lib/pdf reads the captions off the pictures (ViewSnapshot.label) instead of importing it, which
 * would split it into a chunk of its own and add a request to the engine's lazy load.
 */
import type { SnapshotView, SnapshotViewId } from "./types";

export const SNAPSHOT_VIEWS: Readonly<Record<SnapshotViewId, SnapshotView>> = {
  "perspektiva-desno": { id: "perspektiva-desno", label: "Perspektiva desno", az: 0.62, el: 0.3 },
  "perspektiva-lijevo": { id: "perspektiva-lijevo", label: "Perspektiva lijevo", az: -0.62, el: 0.3 },
  frontalno: { id: "frontalno", label: "Frontalno", az: 0, el: 0.12 },
  "pticja-perspektiva": { id: "pticja-perspektiva", label: "Ptičja perspektiva", az: 0.3, el: 1.1 },
};
