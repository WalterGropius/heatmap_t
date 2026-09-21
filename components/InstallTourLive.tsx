"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useYoloModel } from "@/lib/yolo/useYoloModel";
import { useCameraDetection } from "@/lib/yolo/useCameraDetection";
import type { RouterModel, StepHighlight } from "@/lib/routers";

const CONF = 0.7;
/** Height of the rounded callout plate drawn over the camera feed, in CSS px. */
const PLATE_H = 100;
/** Keep the plate this far from the edges of the camera stage. */
const PLATE_MARGIN = 8;

function classConf(detections: { class: string; confidence: number }[], id: string, min = CONF) {
  return detections.some((d) => d.class.toLowerCase() === id.toLowerCase() && d.confidence >= min);
}

export default function InstallTourLive({
  router,
  onDone,
  onBack,
}: {
  router: RouterModel;
  onDone: (ledOk: boolean) => void;
  onBack: () => void;
}) {
  const { model, progress, status, error: modelError } = useYoloModel();
  const { videoRef, detections, isDetecting, cameraError, startCamera, stopCamera } = useCameraDetection({
    model,
    mode: "continuous",
  });

  const [stepIdx, setStepIdx] = useState(0);
  const [powcabDetected, setPowcabDetected] = useState(false);
  const [siminsideDetected, setSiminsideDetected] = useState(false);
  const [onCount, setOnCount] = useState(0);
  // Mapping from video pixels to stage pixels. The <video> is rendered with
  // object-fit: cover, so it is uniformly scaled and centre-cropped — a
  // per-axis scale would drift the callout off the connector whenever the
  // camera's aspect ratio differs from the stage's.
  const [view, setView] = useState({ s: 1, ox: 0, oy: 0, w: 0, h: 0 });
  const [plateW, setPlateW] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  const step = router.steps[stepIdx];
  const isLast = stepIdx === router.steps.length - 1;

  useEffect(() => {
    if (model && !isDetecting) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => stopCamera, [stopCamera]);

  // reset per-step gating state whenever the step changes
  useEffect(() => {
    setPowcabDetected(false);
    setSiminsideDetected(false);
    setOnCount(0);
  }, [stepIdx]);

  useEffect(() => {
    if (step.specialLogic === "requirePowcab") {
      const hasPowcab = classConf(detections, "powcab", 0.8);
      const hasPow = classConf(detections, "pow", 0.5);
      const hasModem = classConf(detections, "modem", 0.7);
      if (hasPowcab && !hasPow && hasModem) setPowcabDetected(true);
    } else if (step.specialLogic === "requireSiminside") {
      const hasSiminside = classConf(detections, "siminside", 0.7);
      const hasModem = classConf(detections, "modem", 0.7);
      if (hasSiminside && hasModem) setSiminsideDetected(true);
    } else if (step.specialLogic === "countOnCheckmark") {
      const count = detections.filter((d) => d.class.toLowerCase() === "on" && d.confidence >= 0.7).length;
      setOnCount((prev) => Math.max(prev, Math.min(count, 3)));
    }
  }, [detections, step.specialLogic]);

  const updateScale = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const s = Math.max(w / video.videoWidth, h / video.videoHeight);
    setView({ s, ox: (w - video.videoWidth * s) / 2, oy: (h - video.videoHeight * s) / 2, w, h });
  }, [videoRef]);

  const measurePlate = useCallback(() => {
    setPlateW(plateRef.current?.offsetWidth ?? 0);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onResize = () => {
      updateScale();
      // the plate can hit its max-width at a narrower stage, changing its width
      measurePlate();
    };
    video.addEventListener("loadedmetadata", updateScale);
    window.addEventListener("resize", onResize);
    updateScale();
    return () => {
      video.removeEventListener("loadedmetadata", updateScale);
      window.removeEventListener("resize", onResize);
    };
  }, [videoRef, updateScale, measurePlate, isDetecting]);

  const isNextEnabled = () => {
    if (step.specialLogic === "requirePowcab") return powcabDetected;
    if (step.specialLogic === "requireSiminside") return siminsideDetected;
    if (step.specialLogic === "countOnCheckmark") return onCount >= 3;
    return true;
  };

  const hasOff = classConf(detections, "off");
  const hasOrange = classConf(detections, "orange");
  const hasOn = classConf(detections, "on");
  const offCount = detections.filter((d) => d.class.toLowerCase() === "off" && d.confidence >= 0.7).length;

  let ledStatus: { type: "warning" | "info" | "error"; text: string } | null = null;
  if (step.key === "led") {
    if (offCount > 3) ledStatus = { type: "warning", text: router.led.offCopy };
    else if (hasOff && hasOrange) ledStatus = { type: "info", text: "Router se zapíná. Vyčkejte prosím pár minut." };
    else if (hasOn) ledStatus = { type: "info", text: "Router se připojuje k síti. Vyčkejte prosím pár minut." };
  }

  const highestForStep = (): { detection: (typeof detections)[number]; highlight: StepHighlight } | null => {
    const candidates = detections
      .filter((d) => d.confidence >= CONF && step.highlights.some((h) => h.id.toLowerCase() === d.class.toLowerCase()))
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates.length === 0) return null;
    const top = candidates[0];
    const highlight = step.highlights.find((h) => h.id.toLowerCase() === top.class.toLowerCase())!;
    return { detection: top, highlight };
  };
  const active = highestForStep();

  /** Anchor the callout above the detection, kept fully inside the stage so
   *  its rounded corners never get clipped by the camera frame. */
  const platePosition = ([bx, by, bw]: [number, number, number, number]) => {
    const cx = (bx + bw / 2) * view.s + view.ox;
    const cy = by * view.s + view.oy;
    const half = plateW / 2;
    const left =
      view.w > 0 && plateW > 0
        ? Math.min(Math.max(cx, half + PLATE_MARGIN), Math.max(half + PLATE_MARGIN, view.w - half - PLATE_MARGIN))
        : cx;
    const top =
      view.h > 0
        ? Math.min(Math.max(cy - PLATE_H / 2, PLATE_MARGIN), Math.max(PLATE_MARGIN, view.h - PLATE_H - PLATE_MARGIN))
        : Math.max(PLATE_MARGIN, cy - PLATE_H / 2);
    return { left: `${left}px`, top: `${top}px` };
  };

  const next = () => {
    if (isLast) {
      onDone(onCount >= 3);
      return;
    }
    setStepIdx((i) => i + 1);
  };
  const back = () => {
    if (stepIdx === 0) {
      onBack();
      return;
    }
    setStepIdx((i) => i - 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="step-body" style={{ paddingBottom: 0, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {(modelError || cameraError) && (
          <div className="banner error">
            <span aria-hidden>⚠️</span>
            <span>{modelError || cameraError}</span>
          </div>
        )}
        {!model && !modelError && (
          <div className="banner info">
            <span className="dot-spin" aria-hidden />
            <span>
              {status} ({progress}%)
            </span>
          </div>
        )}

        <div className="camera-stage" ref={containerRef}>
          <video ref={videoRef} muted playsInline />
          {!isDetecting && model && <div className="camera-placeholder">Zapínám kameru…</div>}
          {active?.highlight.image && (
            <div ref={plateRef} className="camera-highlight" style={platePosition(active.detection.bbox)}>
              <img src={active.highlight.image} alt={step.title} onLoad={measurePlate} />
            </div>
          )}
        </div>
      </div>

      <div className="step-footer" style={{ position: "static" }}>
        <div style={{ width: "100%" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>{step.title}</h1>
          <p className="lead" style={{ margin: "0 0 12px", fontSize: 14 }}>
            {step.description}
          </p>

          {isNextEnabled() ? (
            <div className="banner success" style={{ marginBottom: 12 }}>
              <span aria-hidden>✅</span>
              <span>Správné zapojení</span>
            </div>
          ) : (
            ledStatus && (
              <div className={`banner ${ledStatus.type === "warning" ? "warning" : "info"}`} style={{ marginBottom: 12 }}>
                <span aria-hidden>{ledStatus.type === "warning" ? "⚠️" : "ℹ️"}</span>
                <span>{ledStatus.text}</span>
              </div>
            )
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost btn-back" onClick={back}>
              Zpět
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!isNextEnabled()} onClick={next}>
              {isLast ? "Dokončit instalaci" : "Další"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
