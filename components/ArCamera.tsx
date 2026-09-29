"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  coverView,
  layoutCallout,
  mapBox,
  offscreenDirection,
  visibleRegion,
  type CoverView,
  type Insets,
  type Rect,
  type Size,
} from "@/lib/ar-layout";
import Icon from "./Icon";

export interface ArGeometry {
  stage: Size;
  /** The video element's box, anchored at the stage's top-left corner. */
  frame: Size;
  view: CoverView;
  /** Space taken by the top bar and the instruction sheet. */
  insets: Insets;
  /** false until the camera has delivered its first frame dimensions. */
  ready: boolean;
}

const NO_GEOMETRY: ArGeometry = {
  stage: { w: 0, h: 0 },
  frame: { w: 0, h: 0 },
  view: { s: 1, ox: 0, oy: 0 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  ready: false,
};

/** How far the video runs under the sheet's rounded corners. */
const SHEET_OVERLAP = 24;

/**
 * Full-screen camera view for the detection steps. The camera fills the
 * screen down to the instruction sheet (object-fit: cover), with a
 * translucent top bar over it. The sheet docks to the bottom in portrait and
 * to the right on short landscape screens.
 *
 * The video stops at the sheet instead of running underneath it: the model
 * sees the whole camera frame, so anything hidden behind the sheet would be a
 * part the customer is told about but cannot see — and a shorter box also
 * crops less of the 4:3 frame on a tall phone.
 */
export function ArScreen({
  videoRef,
  topbar,
  sheet,
  overlay,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  topbar: ReactNode;
  sheet: ReactNode;
  overlay: (geo: ArGeometry) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [geo, setGeo] = useState<ArGeometry>(NO_GEOMETRY);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const top = topRef.current;
    const sh = sheetRef.current;
    const video = videoRef.current;
    if (!root || !top || !sh) return;
    const r = root.getBoundingClientRect();
    const t = top.getBoundingClientRect();
    const s = sh.getBoundingClientRect();
    const stage = { w: r.width, h: r.height };
    const insets: Insets = { top: Math.max(0, t.bottom - r.top), right: 0, bottom: 0, left: 0 };
    // A horizontally centred sheet is docked at the bottom (full width on
    // phones, a centred card on tablets); otherwise it is the landscape side panel.
    const centred = Math.abs(s.left + s.width / 2 - (r.left + r.width / 2)) < r.width * 0.1;
    if (centred) insets.bottom = Math.max(0, r.bottom - s.top);
    else insets.right = Math.max(0, r.right - s.left);
    const frame = {
      w: Math.round(stage.w - (insets.right ? Math.max(0, insets.right - SHEET_OVERLAP) : 0)),
      h: Math.round(stage.h - (insets.bottom ? Math.max(0, insets.bottom - SHEET_OVERLAP) : 0)),
    };
    const vw = video?.videoWidth ?? 0;
    const vh = video?.videoHeight ?? 0;
    setGeo((prev) => {
      const next = { stage, frame, insets, view: coverView({ w: vw, h: vh }, frame), ready: vw > 0 && vh > 0 };
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [videoRef]);

  useLayoutEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    [rootRef.current, topRef.current, sheetRef.current].forEach((el) => el && ro?.observe(el));
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", measure);
    video?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro?.disconnect();
      video?.removeEventListener("loadedmetadata", measure);
      video?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure, videoRef]);

  // The page behind must not scroll while the camera owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="ar-screen" ref={rootRef}>
      <video
        ref={videoRef}
        className="ar-video"
        muted
        playsInline
        style={geo.frame.w ? { width: geo.frame.w, height: geo.frame.h } : undefined}
      />
      <div className="ar-scrim" aria-hidden />
      <div className="ar-layer" aria-hidden>
        {geo.stage.w > 0 && overlay(geo)}
      </div>
      <header className="ar-topbar" ref={topRef} data-ar-topbar>
        {topbar}
      </header>
      <section className="ar-sheet" ref={sheetRef} data-ar-sheet>
        {sheet}
      </section>
    </div>
  );
}

/** Box around a detection, expanded a little so a 15 px LED still gets a visible frame. */
function reticleRect(target: Rect, pad: number): Rect {
  return { x: target.x - pad, y: target.y - pad, w: target.w + 2 * pad, h: target.h + 2 * pad };
}

const boxStyle = (r: Rect) => ({
  transform: `translate3d(${r.x}px, ${r.y}px, 0)`,
  width: `${r.w}px`,
  height: `${r.h}px`,
});

export type ReticleTone = "target" | "ok" | "scan";

/** Corner-bracket frame that eases after its detection. */
export function Reticle({
  box,
  geo,
  tone = "target",
  held = false,
  label,
}: {
  box: readonly [number, number, number, number];
  geo: ArGeometry;
  tone?: ReticleTone;
  held?: boolean;
  label?: string;
}) {
  const r = reticleRect(mapBox(box, geo.view), 6);
  const corner = Math.max(10, Math.min(26, Math.min(r.w, r.h) * 0.28));
  return (
    <div
      className={`ar-reticle ${tone}${held ? " held" : ""}`}
      style={{ ...boxStyle(r), ["--corner" as string]: `${corner}px` }}
      data-ar-target
    >
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
      {tone === "ok" && (
        <span className="ar-reticle-badge">
          <Icon name="check" size={16} strokeWidth={3} />
        </span>
      )}
      {label && <span className="ar-reticle-label">{label}</span>}
    </div>
  );
}

export type LedState = "on" | "off" | "orange";

/** Small ring on each detected status LED, colored by what the LED is doing. */
export function LedMarker({
  box,
  geo,
  state,
}: {
  box: readonly [number, number, number, number];
  geo: ArGeometry;
  state: LedState;
}) {
  const t = mapBox(box, geo.view);
  const d = Math.max(26, Math.min(56, Math.max(t.w, t.h) + 12));
  const r = { x: t.x + t.w / 2 - d / 2, y: t.y + t.h / 2 - d / 2, w: d, h: d };
  return (
    <div className={`ar-led ${state}`} style={boxStyle(r)} data-ar-target>
      {state === "on" && <Icon name="check" size={Math.round(d * 0.42)} strokeWidth={3} />}
    </div>
  );
}

/**
 * The instruction artwork, placed beside the target with a leader line to
 * it. If the target is outside the part of the frame the screen shows, an
 * edge arrow points the customer toward it instead.
 */
export function Callout({
  box,
  geo,
  image,
  aspect,
  alt,
}: {
  box: readonly [number, number, number, number];
  geo: ArGeometry;
  image: string;
  aspect: number;
  alt: string;
}) {
  const target = reticleRect(mapBox(box, geo.view), 6);
  const away = offscreenDirection(target, geo.stage, geo.insets);
  if (away !== null) return <OffscreenArrow angle={away} geo={geo} />;

  const { plate, mirrored, leader, side } = layoutCallout({ target, stage: geo.stage, insets: geo.insets, aspect });
  return (
    <>
      {leader && <Leader line={leader} />}
      <div className={`ar-callout side-${side}`} style={boxStyle(plate)} data-ar-callout>
        <img src={image} alt={alt} style={mirrored ? { transform: "scaleX(-1)" } : undefined} draggable={false} />
      </div>
    </>
  );
}

/** Dashed line from the plate to the target, ending in a magenta dot on the part itself. */
function Leader({ line: [x1, y1, x2, y2] }: { line: [number, number, number, number] }) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <>
      <div className="ar-leader" style={{ width: length, transform: `translate3d(${x1}px, ${y1}px, 0) rotate(${angle}deg)` }} />
      <div className="ar-leader-dot" style={{ transform: `translate3d(${x2 - 6}px, ${y2 - 6}px, 0)` }} />
    </>
  );
}

function OffscreenArrow({ angle, geo }: { angle: number; geo: ArGeometry }) {
  const vis = visibleRegion(geo.stage, geo.insets, 44);
  const rad = (angle * Math.PI) / 180;
  const cx = vis.x + vis.w / 2;
  const cy = vis.y + vis.h / 2;
  // walk from the centre toward the target until we hit the visible region's edge
  const k = Math.min(
    Math.abs(Math.cos(rad)) > 1e-3 ? vis.w / 2 / Math.abs(Math.cos(rad)) : Infinity,
    Math.abs(Math.sin(rad)) > 1e-3 ? vis.h / 2 / Math.abs(Math.sin(rad)) : Infinity
  );
  const x = cx + Math.cos(rad) * k;
  const y = cy + Math.sin(rad) * k;
  return (
    <div className="ar-offscreen" style={{ transform: `translate3d(${x - 22}px, ${y - 22}px, 0)` }}>
      <span style={{ transform: `rotate(${angle + 180}deg)` }}>
        <Icon name="back" size={22} strokeWidth={3} />
      </span>
    </div>
  );
}

/** Viewfinder shown in the middle of the visible camera area while nothing relevant is in view. */
export function AimHint({ geo, text }: { geo: ArGeometry; text: string }) {
  const vis = visibleRegion(geo.stage, geo.insets, 24);
  const side = Math.min(vis.w * 0.72, vis.h * 0.62, 300);
  const x = vis.x + (vis.w - side) / 2;
  const y = vis.y + (vis.h - side) / 2 - 12;
  return (
    <div className="ar-aim" style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: side, height: side }}>
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
      <span className="ar-aim-line" />
      <p className="ar-aim-text">{text}</p>
    </div>
  );
}

/** Round translucent icon button for the camera top bar. */
export function ArIconButton({
  icon,
  label,
  onClick,
}: {
  icon: "back" | "close";
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="ar-icon-btn" onClick={onClick} aria-label={label}>
      <Icon name={icon} size={22} strokeWidth={2.5} />
    </button>
  );
}

/** Short buzz when a step is recognised as done — the phone is pointed away from the screen. */
export function haptic(pattern: number | number[] = 40) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported — silently skip
  }
}
