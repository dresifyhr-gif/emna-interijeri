"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  DimLabelTarget,
  KitchenConfig,
  ModuleInfo,
  Mood,
  ScreenRect,
  StudioEngineApi,
  StudioEngineOptions,
  SurfaceHit,
  ViewPreset,
} from "@/lib/studio/types";

export type EngineStatus = "loading" | "ready" | "failed";

/** the engine's CONTEXT_EVENT (lib/studio/engine/index.ts — not imported here: that would bring three.js into the page's first load) */
const CONTEXT_EVENT = "emna-studio-context";
/** a lost WebGL context: the engine is recreated when the browser restores it, or after this long */
const RESTORE_MS = 3000;
/** more losses than this while the studio is open: the 3D view gives up (the steps and the 2D views keep working) */
const MAX_RESTORES = 3;

/**
 * Mounts the vanilla three.js studio engine into `containerRef` (client only, dynamic import so three.js
 * ships only with /studio), keeps it in sync with React state and disposes it on unmount.
 *
 * - `config` / `mood` changes are pushed with setConfig / setMood (the engine diffs and animates); `camera` (the 3D
 *   camera preset — "3D studio", "Iz prostorije", "Frontalno", "Odozgo") with setView, right after the engine is created
 *   too (it keeps the preset through its intro and every rebuild).
 * - The engine constructor throws when WebGL isn't available → status "failed"; the UI keeps working without 3D.
 * - `onDimLabel` makes every dimension label in 3D clickable — the room's walls and the kitchen runs / island (the
 *   length editor); `onSurfaceClick` makes the room's walls and floor clickable (their finish).
 * - Overlays read where things are on screen through api.subscribe (components/studio/overlay.ts useEngineView).
 * - `start: false` holds the engine back (the studio opens in a 2D view: the drawing is drawn first, the engine's heavy
 *   first steps follow); it is created once `start` turns true and lives until unmount.
 * - A lost WebGL context (an iPhone back from another app): the engine stops drawing and says so (CONTEXT_EVENT on the
 *   container). `restoring` turns true (the studio shows "Obnavljam 3D prikaz…"), status goes back to "loading" and
 *   apiRef to null — nothing talks to the dead engine, whose pictures would be blank. When the browser restores the
 *   context, or after RESTORE_MS, it is disposed and created anew the same way, from the current config, mood and camera,
 *   without its intro. The panel stays usable meanwhile.
 */
export function useStudioEngine(
  containerRef: RefObject<HTMLDivElement | null>,
  {
    config,
    mood,
    onSelect,
    onDimLabel,
    onSurfaceClick,
    camera = "studio",
    start = true,
  }: {
    config: KitchenConfig;
    mood: Mood;
    camera?: ViewPreset;
    onSelect: (m: ModuleInfo | null) => void;
    onDimLabel?: (target: DimLabelTarget, rect: ScreenRect) => void;
    onSurfaceClick?: (hit: SurfaceHit) => void;
    start?: boolean;
  },
) {
  const apiRef = useRef<StudioEngineApi | null>(null);
  const [status, setStatus] = useState<EngineStatus>("loading");
  /** the WebGL context was lost: the engine is being created anew */
  const [restoring, setRestoring] = useState(false);
  /** counts the engines created after a lost context (a change creates the next one) */
  const [generation, setGeneration] = useState(0);
  const losses = useRef(0);
  const latest = useRef({ config, mood, camera, onSelect, onDimLabel, onSurfaceClick });

  useEffect(() => {
    latest.current = { config, mood, camera, onSelect, onDimLabel, onSurfaceClick };
  });

  useEffect(() => {
    if (!start) return;
    let cancelled = false;
    let api: StudioEngineApi | null = null;
    let restoreTimer = 0;
    const host = containerRef.current;

    const onContext = (e: Event) => {
      if (cancelled) return;
      const what = (e as CustomEvent<string>).detail;
      if (what === "restored") {
        window.clearTimeout(restoreTimer);
        setGeneration((g) => g + 1);
        return;
      }
      if (what !== "lost") return;
      apiRef.current = null;
      losses.current += 1;
      if (losses.current > MAX_RESTORES) {
        setRestoring(false);
        setStatus("failed");
        return;
      }
      setRestoring(true);
      setStatus("loading");
      restoreTimer = window.setTimeout(() => setGeneration((g) => g + 1), RESTORE_MS);
    };
    host?.addEventListener(CONTEXT_EVENT, onContext);

    import("@/lib/studio/engine").then(
      ({ createStudioEngine }) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        try {
          const options: StudioEngineOptions = {
            mode: "studio",
            config: latest.current.config,
            mood: latest.current.mood,
            onSelect: (m) => latest.current.onSelect(m),
            onDimLabel: (target, rect) => latest.current.onDimLabel?.(target, rect),
            onSurfaceClick: (hit) => latest.current.onSurfaceClick?.(hit),
            onReady: () => {
              if (cancelled) return;
              setStatus("ready");
              setRestoring(false);
            },
            // recreated after a lost context: the kitchen at once, as the customer left it
            instant: generation > 0,
          };
          api = createStudioEngine(el, options);
          apiRef.current = api;
          // anything that changed while the module was loading
          api.setConfig(latest.current.config);
          api.setMood(latest.current.mood);
          if (latest.current.camera !== "studio") api.setView?.(latest.current.camera);
        } catch (err) {
          console.warn("[studio] 3D prikaz nije dostupan:", err);
          api = null;
          setRestoring(false);
          setStatus("failed");
        }
      },
      (err: unknown) => {
        console.warn("[studio] učitavanje 3D prikaza nije uspjelo:", err);
        if (cancelled) return;
        setRestoring(false);
        setStatus("failed");
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimer);
      host?.removeEventListener(CONTEXT_EVENT, onContext);
      api?.dispose();
      apiRef.current = null;
    };
  }, [containerRef, start, generation]);

  useEffect(() => {
    apiRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    apiRef.current?.setMood(mood);
  }, [mood]);

  // (the first preset goes in right after the engine is created, above; a change after that, here)
  const sentCamera = useRef(camera);
  useEffect(() => {
    if (sentCamera.current === camera) return;
    sentCamera.current = camera;
    apiRef.current?.setView?.(camera);
  }, [camera]);

  return { apiRef, status, restoring };
}
