"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { DimTarget, KitchenConfig, ModuleInfo, Mood, ScreenRect, StudioEngineApi } from "@/lib/studio/types";

export type EngineStatus = "loading" | "ready" | "failed";

/**
 * Mounts the vanilla three.js studio engine into `containerRef` (client only, dynamic import so three.js
 * ships only with /studio), keeps it in sync with React state and disposes it on unmount.
 *
 * - `config` / `mood` changes are pushed with setConfig / setMood (the engine diffs and animates).
 * - The engine constructor throws when WebGL isn't available → status "failed"; the UI keeps working without 3D.
 * - `onWallLabel` makes the wall / island dimension labels in 3D clickable (the wall-length editor).
 * - Overlays read where things are on screen through api.subscribe (components/studio/overlay.ts useEngineView).
 */
export function useStudioEngine(
  containerRef: RefObject<HTMLDivElement | null>,
  {
    config,
    mood,
    onSelect,
    onWallLabel,
  }: {
    config: KitchenConfig;
    mood: Mood;
    onSelect: (m: ModuleInfo | null) => void;
    onWallLabel?: (wall: DimTarget, rect: ScreenRect) => void;
  },
) {
  const apiRef = useRef<StudioEngineApi | null>(null);
  const [status, setStatus] = useState<EngineStatus>("loading");
  const latest = useRef({ config, mood, onSelect, onWallLabel });

  useEffect(() => {
    latest.current = { config, mood, onSelect, onWallLabel };
  });

  useEffect(() => {
    let cancelled = false;
    let api: StudioEngineApi | null = null;

    import("@/lib/studio/engine").then(
      ({ createStudioEngine }) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        try {
          api = createStudioEngine(el, {
            mode: "studio",
            config: latest.current.config,
            mood: latest.current.mood,
            onSelect: (m) => latest.current.onSelect(m),
            onWallLabel: (wall, rect) => latest.current.onWallLabel?.(wall, rect),
            onReady: () => {
              if (!cancelled) setStatus("ready");
            },
          });
          apiRef.current = api;
          // anything that changed while the module was loading
          api.setConfig(latest.current.config);
          api.setMood(latest.current.mood);
        } catch (err) {
          console.warn("[studio] 3D prikaz nije dostupan:", err);
          api = null;
          setStatus("failed");
        }
      },
      (err: unknown) => {
        console.warn("[studio] učitavanje 3D prikaza nije uspjelo:", err);
        if (!cancelled) setStatus("failed");
      },
    );

    return () => {
      cancelled = true;
      api?.dispose();
      apiRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    apiRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    apiRef.current?.setMood(mood);
  }, [mood]);

  return { apiRef, status };
}
