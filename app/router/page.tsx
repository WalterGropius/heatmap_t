"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { AimHint, ArIconButton, ArScreen, Reticle, haptic } from "@/components/ArCamera";
import Banner from "@/components/Banner";
import BrandMark from "@/components/BrandMark";
import Icon from "@/components/Icon";
import { useYoloModel } from "@/lib/yolo/useYoloModel";
import { useCameraDetection } from "@/lib/yolo/useCameraDetection";
import { useTrackedTargets } from "@/lib/yolo/useTrackedTargets";
import { routerInView } from "@/lib/yolo/evidence";
import { useSessionStore } from "@/lib/session-store";
import { ROUTERS, DEFAULT_DETECTABLE_ROUTER_ID, getRouter } from "@/lib/routers";
import { NUMBERED_STEP_COUNT, stepNumber } from "@/lib/flow";

type Stage = "loading" | "scanning" | "recognized" | "tips" | "label" | "manual";

const RECOGNIZE_CONFIDENCE = 0.6;
const RECOGNIZE_HOLD_MS = 1200;
const SCAN_TIMEOUT_MS = 9000;
const MODEM = ["modem"] as const;

export default function RouterRecognitionPage() {
  const nav = useRouter();
  const patch = useSessionStore((s) => s.patch);
  const { model, progress, status, error: modelError } = useYoloModel();
  const { videoRef, detections, isDetecting, cameraError, startCamera, stopCamera } = useCameraDetection({
    model,
    mode: "continuous",
  });
  const inView = useMemo(() => {
    const v = videoRef.current;
    return routerInView(detections, { w: v?.videoWidth ?? 0, h: v?.videoHeight ?? 0 }, RECOGNIZE_CONFIDENCE);
  }, [detections, videoRef]);
  const routerDetections = useMemo(() => (inView ? [inView] : []), [inView]);
  const tracks = useTrackedTargets(routerDetections, { classes: MODEM, minConfidence: RECOGNIZE_CONFIDENCE });

  const [stage, setStage] = useState<Stage>("loading");
  const [holdFraction, setHoldFraction] = useState(0);
  const heldSinceRef = useRef<number | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginScanning = useCallback(() => {
    heldSinceRef.current = null;
    setHoldFraction(0);
    setStage("scanning");
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      setStage((cur) => (cur === "scanning" ? "tips" : cur));
    }, SCAN_TIMEOUT_MS);
  }, []);

  // (re)start the camera whenever the camera view is on screen — including
  // coming back from the manual list, which stops it
  useEffect(() => {
    if (model && stage !== "manual" && !isDetecting) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, stage]);

  useEffect(() => {
    if (isDetecting && stage === "loading") beginScanning();
  }, [isDetecting, stage, beginScanning]);

  // 3D/vision recognition: hold a confident "modem" detection for a short
  // streak before accepting it, so a single noisy frame can't trigger it.
  useEffect(() => {
    if (stage !== "scanning") return;
    if (inView) {
      if (heldSinceRef.current == null) heldSinceRef.current = performance.now();
      const held = performance.now() - heldSinceRef.current;
      setHoldFraction(Math.min(1, held / RECOGNIZE_HOLD_MS));
      if (held >= RECOGNIZE_HOLD_MS) {
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        haptic([30, 60, 30]);
        setStage("recognized");
      }
    } else {
      heldSinceRef.current = null;
      setHoldFraction(0);
    }
  }, [inView, stage]);

  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => () => {
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (stage === "manual") stopCamera();
  }, [stage, stopCamera]);

  const confirmRecognized = () => {
    patch({ routerId: DEFAULT_DETECTABLE_ROUTER_ID });
    nav.push("/network");
  };

  const pickManual = (id: string) => {
    patch({ routerId: id });
    nav.push("/network");
  };

  const recognizedRouter = getRouter(DEFAULT_DETECTABLE_ROUTER_ID);
  const failed = modelError || cameraError;

  if (stage === "manual") {
    return (
      <StepShell
        step="router"
        footer={
          <button className="btn btn-ghost btn-block" onClick={beginScanning}>
            <Icon name="camera" size={20} /> Zkusit rozpoznat kamerou
          </button>
        }
      >
        <p className="step-eyebrow">Router</p>
        <h1>Vyberte svůj router</h1>
        <p className="lead">Model najdete na štítku na spodní nebo zadní straně routeru.</p>
        <div className="router-card-grid">
          {ROUTERS.map((r) => (
            <button className="router-card" key={r.id} onClick={() => pickManual(r.id)}>
              <img src={r.image} alt="" />
              <b>{r.name}</b>
              <span>{r.subtitle}</span>
            </button>
          ))}
        </div>
      </StepShell>
    );
  }

  // The <video> stays mounted for every stage but "manual" so `videoRef` is
  // already attached by the time the camera stream is ready to play into it
  // — gating it on `stage` created a chicken-and-egg deadlock where the
  // stream could never start because the stage only advances once it does.
  const n = stepNumber("router");
  return (
    <ArScreen
      videoRef={videoRef}
      topbar={
        <>
          <ArIconButton icon="back" label="Zpět" onClick={() => nav.push("/consent")} />
          <div className="ar-topbar-center">
            <p className="ar-eyebrow">
              Krok {n} z {NUMBERED_STEP_COUNT} · Rozpoznání routeru
            </p>
          </div>
          <BrandMark size={34} />
        </>
      }
      overlay={(geo) => {
        if (!geo.ready || failed) return null;
        const modem = tracks[0];
        return (
          <>
            {modem && (stage === "scanning" || stage === "recognized") && (
              <Reticle
                box={modem.box}
                geo={geo}
                held={!modem.fresh}
                tone={stage === "recognized" ? "ok" : "scan"}
                label={stage === "recognized" ? recognizedRouter.name : undefined}
              />
            )}
            {stage === "scanning" && !modem && <AimHint geo={geo} text="Namiřte kameru na router" />}
          </>
        );
      }}
      sheet={
        <>
          {failed && (
            <>
              <Banner tone="error">{failed}</Banner>
              <button className="btn btn-primary btn-block" onClick={() => setStage("manual")}>
                Vybrat router ručně
              </button>
            </>
          )}

          {!failed && stage === "loading" && (
            <>
              <div className="ar-status busy" role="status">
                <span className="dot-spin" aria-hidden />
                <span>{isDetecting || !model ? status : "Zapínám kameru…"}</span>
              </div>
              <h1 className="ar-title">Namiřte kameru na router</h1>
              <div className="ar-meter" aria-hidden>
                <span style={{ width: `${model ? 100 : progress}%` }} />
              </div>
            </>
          )}

          {!failed && stage === "scanning" && (
            <>
              <div className={`ar-status ${holdFraction > 0 ? "found" : "scan"}`} role="status" aria-live="polite">
                <Icon name={holdFraction > 0 ? "scan" : "camera"} size={18} />
                <span>{holdFraction > 0 ? "Rozpoznávám router…" : "Hledám router…"}</span>
              </div>
              <h1 className="ar-title">Namiřte kameru na router</h1>
              <p className="ar-lead">
                Rozpoznáme ho automaticky. Když to nepůjde, pomůžeme vám jinak — sken štítku nebo ruční výběr.
              </p>
              <div className="ar-meter" aria-hidden>
                <span style={{ width: `${holdFraction * 100}%` }} />
              </div>
              <button className="btn btn-link" onClick={() => setStage("manual")}>
                Vybrat router ručně
              </button>
            </>
          )}

          {!failed && stage === "recognized" && (
            <>
              <div className="ar-status ok" role="status">
                <Icon name="checkCircle" size={18} />
                <span>Router rozpoznán</span>
              </div>
              <div className="ar-product">
                <img src={recognizedRouter.image} alt="" />
                <div>
                  <h1 className="ar-title">{recognizedRouter.name}</h1>
                  <p className="ar-lead">Rozpoznali jsme váš router. Je to tak?</p>
                </div>
              </div>
              <div className="ar-actions">
                <button className="btn btn-ghost" onClick={() => setStage("manual")}>
                  Není to on
                </button>
                <button className="btn btn-primary" onClick={confirmRecognized}>
                  Ano, pokračovat
                </button>
              </div>
            </>
          )}

          {!failed && stage === "tips" && (
            <>
              <div className="ar-status warn" role="status">
                <Icon name="bulb" size={18} />
                <span>Router se nepodařilo rozpoznat</span>
              </div>
              <ul className="ar-tips">
                <li>Otočte router tak, aby byl vidět celý.</li>
                <li>Zvolte kontrastní, jednobarevné pozadí.</li>
                <li>Přisviťte si — router musí být dobře vidět.</li>
                <li>Namiřte na zadní stranu se štítkem.</li>
              </ul>
              <div className="ar-actions">
                <button className="btn btn-ghost" onClick={() => setStage("label")}>
                  Sken štítku
                </button>
                <button className="btn btn-primary" onClick={beginScanning}>
                  Zkusit znovu
                </button>
              </div>
              <button className="btn btn-link" onClick={() => setStage("manual")}>
                Vybrat router ručně
              </button>
            </>
          )}

          {!failed && stage === "label" && (
            <>
              <div className="ar-status scan" role="status">
                <Icon name="tag" size={18} />
                <span>Sken štítku</span>
              </div>
              <h1 className="ar-title">Najděte štítek s modelem</h1>
              <p className="ar-lead">
                Štítek je na zadní nebo spodní straně routeru. Podle vytištěného modelu jej pak vyberte ze seznamu.
              </p>
              <div className="ar-actions">
                <button className="btn btn-ghost" onClick={beginScanning}>
                  Znovu automaticky
                </button>
                <button className="btn btn-primary" onClick={() => setStage("manual")}>
                  Vybrat model
                </button>
              </div>
            </>
          )}
        </>
      }
    />
  );
}
