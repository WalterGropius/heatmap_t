import type { DetectionResult } from "./types";

/** Every class except "modem": the ports, buttons, SIM slot and LEDs on the router. */
const ROUTER_PARTS = new Set(["lan", "onbutton", "pow", "powcab", "sim", "siminside", "simopen", "on", "off", "orange"]);

/** A box this close to the whole frame says nothing about what is in it. */
const FULL_FRAME = 0.9;

/**
 * The confident "modem" detection that actually indicates a router, or null.
 *
 * The shipped detector answers "modem" at ~95 % confidence, with a box
 * covering the whole frame, for any featureless image — a blank wall, a black
 * frame while the camera starts, even pure noise. A third of its training
 * labels are close-ups whose modem box is the entire photo, and it learned
 * that prior. So a frame-filling modem box only counts when some router part
 * is detected alongside it; in the training set that holds for 99 % of
 * frame-filling modem labels.
 */
export function routerInView(
  detections: DetectionResult[],
  frame: { w: number; h: number },
  minConfidence: number
): DetectionResult | null {
  const modems = detections
    .filter((d) => d.class.toLowerCase() === "modem" && d.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
  if (modems.length === 0) return null;
  const partVisible = detections.some((d) => ROUTER_PARTS.has(d.class.toLowerCase()) && d.confidence >= 0.5);
  if (partVisible || !frame.w || !frame.h) return modems[0];
  return (
    modems.find(({ bbox: [, , w, h] }) => !(w >= frame.w * FULL_FRAME && h >= frame.h * FULL_FRAME)) ?? null
  );
}
