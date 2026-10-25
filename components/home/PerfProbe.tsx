"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const FpsOverlay = dynamic(() => import("./FpsOverlay"), { ssr: false });

const noSubscribe = () => () => {};
const wantsReadout = () => new URLSearchParams(window.location.search).get("fps") === "1";
const never = () => false;

/**
 * `?fps=1` on the homepage shows a small frame-rate / 3D-quality readout (FpsOverlay) for checking
 * smoothness on real devices. Without the parameter it renders nothing and loads nothing. The page stays
 * static: the query is read in the browser, not through searchParams.
 */
export function PerfProbe() {
  const on = useSyncExternalStore(noSubscribe, wantsReadout, never);
  return on ? <FpsOverlay /> : null;
}
