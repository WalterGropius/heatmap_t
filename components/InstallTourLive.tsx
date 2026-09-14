"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useYoloModel } from "@/lib/yolo/useYoloModel";
import { useCameraDetection } from "@/lib/yolo/useCameraDetection";
import type { RouterModel, StepHighlight } from "@/lib/routers";

const CONF = 0.7;

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
  const [scale, setScale] = useState({ x: 1, y: 1, w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

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
    setScale({ x: w / video.videoWidth, y: h / video.videoHeight, w, h });
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener("loadedmetadata", updateScale);
    window.addEventListener("resize", updateScale);
    updateScale();
    return () => {
      video.removeEventListener("loadedmetadata", updateScale);
      window.removeEventListener("resize", updateScale);
    };
  }, [videoRef, updateScale, isDetecting]);

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
            <div
              className="camera-highlight"
              style={{
                left: `${active.detection.bbox[0] * scale.x}px`,
                top: `${Math.max(0, active.detection.bbox[1] * scale.y - 50)}px`,
                height: 100,
              }}
            >
              <img src={active.highlight.image} alt={active.detection.class} />
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
