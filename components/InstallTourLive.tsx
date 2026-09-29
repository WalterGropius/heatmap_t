"use client";

import { useEffect, useRef, useState } from "react";
import { useYoloModel } from "@/lib/yolo/useYoloModel";
import { useCameraDetection } from "@/lib/yolo/useCameraDetection";
import { useTrackedTargets } from "@/lib/yolo/useTrackedTargets";
import type { RouterModel } from "@/lib/routers";
import { AimHint, ArIconButton, ArScreen, Callout, LedMarker, Reticle, haptic, type LedState } from "./ArCamera";
import Banner from "./Banner";
import BrandMark from "./BrandMark";
import Icon from "./Icon";

const CONF = 0.7;
const LED_CLASSES = ["on", "off", "orange"] as const;
const LEDS_REQUIRED = 3;

/** What the customer is looking at, in words — never the raw class id. */
const PART_NAME: Record<string, string> = {
  pow: "konektor napájení",
  powcab: "zapojený napájecí kabel",
  sim: "slot SIM karty",
  simopen: "otevřený slot SIM karty",
  siminside: "vloženou SIM kartu",
  onbutton: "tlačítko napájení",
  on: "kontrolky",
  off: "kontrolky",
  orange: "kontrolky",
};

const STATUS_ICON = { scan: "camera", found: "scan", ok: "checkCircle", warn: "alert", busy: "camera" } as const;

function classConf(detections: { class: string; confidence: number }[], id: string, min = CONF) {
  return detections.some((d) => d.class.toLowerCase() === id.toLowerCase() && d.confidence >= min);
}

export default function InstallTourLive({
  router,
  onDone,
  onBack,
  onCameraUnavailable,
}: {
  router: RouterModel;
  onDone: (ledOk: boolean) => void;
  onBack: () => void;
  /** Switch to the manual checklist when the camera or the model cannot run. */
  onCameraUnavailable: () => void;
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

  const step = router.steps[stepIdx];
  const isLast = stepIdx === router.steps.length - 1;
  const isLed = step.key === "led";

  const trackedIds = isLed
    ? [...LED_CLASSES]
    : [...step.highlights.map((h) => h.id), ...(step.doneClass ? [step.doneClass] : [])];
  const tracks = useTrackedTargets(detections, { classes: trackedIds, minConfidence: CONF });

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
      setOnCount((prev) => Math.max(prev, Math.min(count, LEDS_REQUIRED)));
    }
  }, [detections, step.specialLogic]);

  const gateOpen =
    step.specialLogic === "requirePowcab"
      ? powcabDetected
      : step.specialLogic === "requireSiminside"
        ? siminsideDetected
        : step.specialLogic === "countOnCheckmark"
          ? onCount >= LEDS_REQUIRED
          : true;
  const hasGate = !!step.specialLogic;

  // one buzz when a gated step flips to done
  const buzzed = useRef(false);
  useEffect(() => {
    if (hasGate && gateOpen && !buzzed.current) {
      buzzed.current = true;
      haptic([30, 60, 30]);
    }
    if (!gateOpen) buzzed.current = false;
  }, [gateOpen, hasGate]);

  const offCount = detections.filter((d) => d.class.toLowerCase() === "off" && d.confidence >= 0.7).length;
  const hasOff = offCount > 0;
  const hasOrange = classConf(detections, "orange");
  const hasOn = classConf(detections, "on");

  let ledStatus: { tone: "warning" | "info"; text: string } | null = null;
  if (isLed && !gateOpen) {
    if (offCount > 3) ledStatus = { tone: "warning", text: router.led.offCopy };
    else if (hasOff && hasOrange) ledStatus = { tone: "info", text: "Router se zapíná. Vyčkejte prosím pár minut." };
    else if (hasOn) ledStatus = { tone: "info", text: "Router se připojuje k síti. Vyčkejte prosím pár minut." };
  }

  const doneTrack = step.doneClass ? tracks.find((t) => t.cls === step.doneClass) : undefined;
  // the part still to act on: an LED to check, or a connector/slot with instruction artwork
  const primary = isLed
    ? tracks.find((t) => t.cls === "on")
    : tracks.find((t) => step.highlights.some((h) => h.id === t.cls && h.image));
  const primaryHighlight = primary && step.highlights.find((h) => h.id.toLowerCase() === primary.cls);
  const seesSomething = tracks.length > 0;
  const stepDone = hasGate && gateOpen;

  const next = () => {
    if (isLast) {
      onDone(onCount >= LEDS_REQUIRED);
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

  const failed = modelError || cameraError;
  const loading = !model && !modelError;

  // One status line carries everything that changes while the step is on
  // screen, so the sheet — and with it the camera view above it — keeps its height.
  let statusLine: { tone: "scan" | "found" | "ok" | "busy" | "warn"; text: string };
  if (loading) statusLine = { tone: "busy", text: `${status} ${progress} %` };
  else if (!isDetecting) statusLine = { tone: "busy", text: "Zapínám kameru…" };
  else if (stepDone) statusLine = { tone: "ok", text: isLed ? "Router je připojený k síti" : "Správné zapojení" };
  else if (ledStatus) statusLine = { tone: ledStatus.tone === "warning" ? "warn" : "found", text: ledStatus.text };
  else if (isLed && seesSomething)
    statusLine = { tone: "found", text: `Svítí ${Math.min(onCount, LEDS_REQUIRED)} z ${LEDS_REQUIRED} kontrolek` };
  else if (primary) statusLine = { tone: "found", text: `Vidím ${PART_NAME[primary.cls] ?? "router"}` };
  else if (doneTrack) statusLine = { tone: "found", text: `Vidím ${PART_NAME[doneTrack.cls] ?? "router"}` };
  else statusLine = { tone: "scan", text: "Hledám…" };

  return (
    <ArScreen
      videoRef={videoRef}
      topbar={
        <>
          <ArIconButton icon="back" label="Zpět" onClick={back} />
          <div className="ar-topbar-center">
            <div className="ar-steps" aria-hidden>
              {router.steps.map((s, i) => (
                <span key={s.key} className={i < stepIdx ? "done" : i === stepIdx ? "current" : ""} />
              ))}
            </div>
            <p className="ar-eyebrow">
              Krok {stepIdx + 1} z {router.steps.length} · {step.shortTitle}
            </p>
          </div>
          <BrandMark size={34} />
        </>
      }
      overlay={(geo) => {
        if (!geo.ready || failed) return null;
        return (
          <>
            {isLed ? (
              tracks.map((t) => <LedMarker key={t.id} box={t.box} geo={geo} state={t.cls as LedState} />)
            ) : doneTrack ? (
              // the plugged cable / inserted SIM is what matters now — frame only that, in green
              <Reticle key={doneTrack.id} box={doneTrack.box} geo={geo} held={!doneTrack.fresh} tone="ok" />
            ) : (
              tracks.map((t) => <Reticle key={t.id} box={t.box} geo={geo} held={!t.fresh} />)
            )}
            {primary && primaryHighlight?.image && !stepDone && !doneTrack && (
              <Callout
                box={primary.box}
                geo={geo}
                image={primaryHighlight.image}
                aspect={primaryHighlight.aspect ?? 2}
                alt={step.title}
              />
            )}
            {isDetecting && !seesSomething && !stepDone && <AimHint geo={geo} text={step.aimHint} />}
          </>
        );
      }}
      sheet={
        <>
          <div className={`ar-status ${statusLine.tone}`} role="status" aria-live="polite">
            {statusLine.tone === "busy" ? (
              <span className="dot-spin" aria-hidden />
            ) : (
              <Icon name={STATUS_ICON[statusLine.tone]} size={18} />
            )}
            <span>{statusLine.text}</span>
          </div>
          <h1 className="ar-title">{step.title}</h1>
          <p className="ar-lead">{step.description}</p>

          {failed && (
            <>
              <Banner tone="error">{failed}</Banner>
              <button className="btn btn-ghost btn-block" onClick={onCameraUnavailable}>
                Pokračovat bez kamery
              </button>
            </>
          )}

          {!failed && (
            <button
              className={`btn btn-primary btn-block${stepDone ? " pulse" : ""}`}
              disabled={!gateOpen}
              onClick={next}
            >
              {isLast ? "Dokončit instalaci" : "Další"}
            </button>
          )}
        </>
      }
    />
  );
}
