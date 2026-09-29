/**
 * Geometry for the camera-step AR overlay: mapping detections from video
 * pixels onto the full-screen stage, and placing the instruction callout next
 * to the part it points at.
 *
 * The callout artwork is drawn with its arrow on the left, pointing left —
 * it is meant to sit to the RIGHT of the connector. Centering it on the
 * detection (as the first version did) put the plate on top of the very port
 * the customer was supposed to find. The detections the model produces range
 * from a 20 px LED seen from across the room to a connector filling the frame,
 * so the plate is also sized from the target instead of being one fixed size.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Uniform scale + offset of an `object-fit: cover` video inside its stage. */
export interface CoverView {
  s: number;
  ox: number;
  oy: number;
}

export function coverView(video: Size, stage: Size): CoverView {
  if (!video.w || !video.h || !stage.w || !stage.h) return { s: 1, ox: 0, oy: 0 };
  const s = Math.max(stage.w / video.w, stage.h / video.h);
  return { s, ox: (stage.w - video.w * s) / 2, oy: (stage.h - video.h * s) / 2 };
}

/** [x, y, w, h] in video pixels → stage pixels. */
export function mapBox([x, y, w, h]: readonly [number, number, number, number], v: CoverView): Rect {
  return { x: x * v.s + v.ox, y: y * v.s + v.oy, w: w * v.s, h: h * v.s };
}

/** The part of the stage not covered by the top bar and the instruction sheet. */
export function visibleRegion(stage: Size, insets: Insets, margin = 0): Rect {
  return {
    x: insets.left + margin,
    y: insets.top + margin,
    w: Math.max(0, stage.w - insets.left - insets.right - 2 * margin),
    h: Math.max(0, stage.h - insets.top - insets.bottom - 2 * margin),
  };
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export const CALLOUT = {
  /** Artwork height bounds, CSS px. Below ~40 px the line art stops being legible. */
  minArt: 40,
  maxArt: 92,
  /** Artwork height relative to the target's height before clamping. */
  artPerTarget: 0.9,
  /** The plate never takes more than this share of the visible width. */
  maxWidthShare: 0.62,
  /** Plate padding around the artwork. */
  pad: 8,
  /** Space between the target's reticle and the plate. */
  gap: 16,
  /** Keep the plate this far from the visible region's edges. */
  margin: 10,
} as const;

/** How much an above/below placement is worth relative to a beside placement of the same size. */
const VERTICAL_WEIGHT = 0.6;

export type CalloutSide = "right" | "left" | "below" | "above" | "dock";

export interface CalloutLayout {
  plate: Rect;
  side: CalloutSide;
  /** Flip the artwork horizontally so its arrow points toward the target. */
  mirrored: boolean;
  /** Leader line from the plate to the target, or null when docked. */
  leader: [number, number, number, number] | null;
}

/**
 * Place the callout plate beside `target`, inside the visible region.
 *
 * Considers right of the target (the artwork's native direction), left of
 * it (mirrored), below and above, each from the size the target calls for
 * down to the minimum, and keeps the placement that stays largest — with
 * above/below discounted, since only a beside placement lets the artwork's
 * arrow point straight at the part. If the target is so large
 * or so close that no side has room even at the minimum size, the plate docks
 * to whichever edge of the visible region overlaps the target least — at that
 * point the target fills the view and needs no pointing at.
 */
export function layoutCallout({
  target,
  stage,
  insets,
  aspect,
}: {
  target: Rect;
  stage: Size;
  insets: Insets;
  /** Artwork width / height. */
  aspect: number;
}): CalloutLayout {
  const { pad, gap, minArt, maxArt, margin } = CALLOUT;
  const vis = visibleRegion(stage, insets, margin);
  const maxByWidth = (vis.w * CALLOUT.maxWidthShare - 2 * pad) / aspect;
  const maxByHeight = vis.h * 0.3 - 2 * pad;
  const top = Math.max(minArt, Math.min(maxArt, maxByWidth, maxByHeight));
  let art = clamp(target.h * CALLOUT.artPerTarget, minArt, top);

  const tcx = target.x + target.w / 2;
  const tcy = target.y + target.h / 2;
  const visRight = vis.x + vis.w;
  const visBottom = vis.y + vis.h;
  const desired = art;

  // Every (size, side) that fits, scored by how much of the desired size it
  // keeps. Above/below count for less: the artwork's arrow is horizontal, so
  // it only truly points at the part from the left or the right.
  let best: { score: number; side: CalloutSide; plate: Rect } | null = null;
  for (;;) {
    const pw = art * aspect + 2 * pad;
    const ph = art + 2 * pad;
    const alongY = clamp(tcy - ph / 2, vis.y, visBottom - ph);
    const alongX = clamp(tcx - pw / 2, vis.x, visRight - pw);
    const candidates: Array<{ side: CalloutSide; x: number; y: number; fits: boolean }> = [
      { side: "right", x: target.x + target.w + gap, y: alongY, fits: target.x + target.w + gap + pw <= visRight && ph <= vis.h },
      { side: "left", x: target.x - gap - pw, y: alongY, fits: target.x - gap - pw >= vis.x && ph <= vis.h },
      { side: "below", x: alongX, y: target.y + target.h + gap, fits: target.y + target.h + gap + ph <= visBottom && pw <= vis.w },
      { side: "above", x: alongX, y: target.y - gap - ph, fits: target.y - gap - ph >= vis.y && pw <= vis.w },
    ];
    for (const c of candidates) {
      if (!c.fits) continue;
      const horizontal = c.side === "right" || c.side === "left";
      const score = (art / desired) * (horizontal ? 1 : VERTICAL_WEIGHT) - (c.side === "left" ? 0.001 : 0);
      if (!best || score > best.score) best = { score, side: c.side, plate: { x: c.x, y: c.y, w: pw, h: ph } };
    }
    if (art <= minArt) break;
    art = Math.max(minArt, art * 0.8);
  }
  if (best) {
    const { plate, side } = best;
    return {
      plate,
      side,
      mirrored: side === "left" || ((side === "above" || side === "below") && tcx > plate.x + plate.w / 2),
      leader: leaderLine(plate, target, side),
    };
  }

  // Docked: nothing fits beside the target, so it fills most of the view.
  const pw = Math.min(art * aspect + 2 * pad, vis.w);
  const ph = art + 2 * pad;
  const x = clamp(tcx - pw / 2, vis.x, visRight - pw);
  const atBottom = { x, y: visBottom - ph, w: pw, h: ph };
  const atTop = { x, y: vis.y, w: pw, h: ph };
  const plate = intersectionArea(atBottom, target) <= intersectionArea(atTop, target) ? atBottom : atTop;
  return { plate, side: "dock", mirrored: false, leader: null };
}

function leaderLine(plate: Rect, target: Rect, side: CalloutSide): [number, number, number, number] {
  const pcx = plate.x + plate.w / 2;
  const pcy = plate.y + plate.h / 2;
  switch (side) {
    case "right":
      return [plate.x, pcy, target.x + target.w, clamp(pcy, target.y, target.y + target.h)];
    case "left":
      return [plate.x + plate.w, pcy, target.x, clamp(pcy, target.y, target.y + target.h)];
    case "below":
      return [pcx, plate.y, clamp(pcx, target.x, target.x + target.w), target.y + target.h];
    default:
      return [pcx, plate.y + plate.h, clamp(pcx, target.x, target.x + target.w), target.y];
  }
}

/**
 * Where an off-screen target lies, as an angle in degrees (0 = right,
 * 90 = down) from the centre of the visible region, or null if on screen.
 * The cover crop hides up to a third of a 4:3 frame on a tall phone, so the
 * model can see a connector the customer cannot.
 */
export function offscreenDirection(target: Rect, stage: Size, insets: Insets): number | null {
  const vis = visibleRegion(stage, insets);
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  if (cx >= vis.x && cx <= vis.x + vis.w && cy >= vis.y && cy <= vis.y + vis.h) return null;
  return (Math.atan2(cy - (vis.y + vis.h / 2), cx - (vis.x + vis.w / 2)) * 180) / Math.PI;
}
