"use client";

import { useEffect, useRef, useState } from "react";
import type { DetectionResult } from "./types";

type Box = [number, number, number, number];

export interface Track {
  /** Stable across frames, so React keeps the same DOM node and CSS can ease it. */
  id: number;
  cls: string;
  box: Box;
  confidence: number;
  /** false while the track is only being held over a missed frame. */
  fresh: boolean;
}

interface Internal extends Track {
  lastSeen: number;
}

function iou(a: Box, b: Box): number {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

/**
 * Turns the raw per-inference detections into steadier on-screen targets.
 *
 * Inference runs a few times a second and every frame's boxes wobble by a few
 * pixels, and a single missed frame would make a reticle blink off and on.
 * Each detection is matched to the previous frame's box of the same class,
 * eased toward its new position, and held for `holdMs` after it was last seen.
 */
export function useTrackedTargets(
  detections: DetectionResult[],
  {
    classes,
    minConfidence = 0.5,
    holdMs = 600,
    smoothing = 0.55,
  }: { classes: readonly string[]; minConfidence?: number; holdMs?: number; smoothing?: number }
): Track[] {
  const tracksRef = useRef<Internal[]>([]);
  const nextId = useRef(1);
  const [tracks, setTracks] = useState<Track[]>([]);
  const classKey = classes.map((c) => c.toLowerCase()).join(",");

  useEffect(() => {
    const wanted = new Set(classKey.split(",").filter(Boolean));
    const now = performance.now();
    const previous = tracksRef.current.filter((t) => wanted.has(t.cls));
    const matched = new Set<Internal>();
    const next: Internal[] = [];

    const incoming = detections
      .filter((d) => d.confidence >= minConfidence && wanted.has(d.class.toLowerCase()))
      .sort((a, b) => b.confidence - a.confidence);

    for (const d of incoming) {
      const cls = d.class.toLowerCase();
      let best: Internal | null = null;
      let bestScore = 0;
      for (const t of previous) {
        if (matched.has(t) || t.cls !== cls) continue;
        const overlap = iou(t.box, d.bbox);
        // tolerate fast pans that move the box off its old footprint entirely
        const dx = t.box[0] + t.box[2] / 2 - (d.bbox[0] + d.bbox[2] / 2);
        const dy = t.box[1] + t.box[3] / 2 - (d.bbox[1] + d.bbox[3] / 2);
        const near = Math.hypot(dx, dy) < Math.max(d.bbox[2], d.bbox[3]) * 0.8 ? 0.01 : 0;
        const score = Math.max(overlap, near);
        if (score > bestScore) {
          best = t;
          bestScore = score;
        }
      }
      if (best) {
        matched.add(best);
        const box = best.box.map((v, i) => v + (d.bbox[i] - v) * smoothing) as Box;
        next.push({ ...best, box, confidence: d.confidence, fresh: true, lastSeen: now });
      } else {
        next.push({ id: nextId.current++, cls, box: [...d.bbox] as Box, confidence: d.confidence, fresh: true, lastSeen: now });
      }
    }

    for (const t of previous) {
      if (!matched.has(t) && now - t.lastSeen < holdMs) next.push({ ...t, fresh: false });
    }

    tracksRef.current = next;
    setTracks(next.map(({ lastSeen: _lastSeen, ...t }) => t).sort((a, b) => b.confidence - a.confidence));
  }, [detections, classKey, minConfidence, holdMs, smoothing]);

  return tracks;
}
