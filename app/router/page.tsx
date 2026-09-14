"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { useYoloModel } from "@/lib/yolo/useYoloModel";
import { useCameraDetection } from "@/lib/yolo/useCameraDetection";
import { useSessionStore } from "@/lib/session-store";
import { ROUTERS, DEFAULT_DETECTABLE_ROUTER_ID, getRouter } from "@/lib/routers";

type Stage = "loading" | "scanning" | "recognized" | "tips" | "label" | "manual";

const RECOGNIZE_CONFIDENCE = 0.6;
const RECOGNIZE_HOLD_MS = 1200;
const SCAN_TIMEOUT_MS = 9000;

export default function RouterRecognitionPage() {
  const nav = useRouter();
  const patch = useSessionStore((s) => s.patch);
  const { model, progress, status, error: modelError } = useYoloModel();
  const { videoRef, detections, isDetecting, cameraError, startCamera, stopCamera } = useCameraDetection({
    model,
    mode: "continuous",
  });

  const [stage, setStage] = useState<Stage>("loading");
  const heldSinceRef = useRef<number | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginScanning = useCallback(() => {
    heldSinceRef.current = null;
    setStage("scanning");
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      setStage((cur) => (cur === "scanning" ? "tips" : cur));
    }, SCAN_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (model && !isDetecting) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    if (isDetecting && stage === "loading") beginScanning();
  }, [isDetecting, stage, beginScanning]);

  // 3D/vision recognition: hold a confident "modem" detection for a short
  // streak before accepting it, so a single noisy frame can't trigger it.
  useEffect(() => {
    if (stage !== "scanning") return;
    const seesModem = detections.some((d) => d.class.toLowerCase() === "modem" && d.confidence >= RECOGNIZE_CONFIDENCE);
    if (seesModem) {
      if (heldSinceRef.current == null) heldSinceRef.current = performance.now();
      else if (performance.now() - heldSinceRef.current >= RECOGNIZE_HOLD_MS) {
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        setStage("recognized");
      }
    } else {
      heldSinceRef.current = null;
    }
  }, [detections, stage]);

  useEffect(() => stopCamera, [stopCamera]);

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
  // The <video> stays mounted for every stage but "manual" so `videoRef` is
  // already attached by the time the camera stream is ready to play into it
  // — gating it on `stage` created a chicken-and-egg deadlock where the
  // stream could never start because the stage only advances once it does.
  const showCamera = stage !== "manual";

  return (
    <StepShell step="router">
      <p className="step-eyebrow">Krok 1 · Router</p>
      <h1>Namiřte kamerou na router</h1>
      <p className="lead">
        Zkusíme router rozpoznat automaticky. Pokud se to nepovede, pomůžeme
        vám to jinak — stačí sken štítku nebo ruční výběr.
      </p>

      {(modelError || cameraError) && (
        <div className="banner error">
          <span aria-hidden>⚠️</span>
          <span>{modelError || cameraError}</span>
        </div>
      )}

      {stage === "loading" && !modelError && (
        <div className="banner info">
          <span className="dot-spin" aria-hidden />
          <span>
            {status} ({progress}%)
          </span>
        </div>
      )}

      {showCamera && (
        <div className="camera-stage">
          <video ref={videoRef} muted playsInline />
          {stage === "scanning" && <div className="camera-overlay-chip">Hledám router…</div>}
          {stage === "recognized" && <div className="camera-overlay-chip">Router rozpoznán ✓</div>}
          {!isDetecting && <div className="camera-placeholder">Zapínám kameru…</div>}
        </div>
      )}

      {stage === "recognized" && (
        <>
          <div className="banner success">
            <span aria-hidden>✅</span>
            <span>
              Rozpoznali jsme <b>{recognizedRouter.name}</b>. Je to tak?
            </span>
          </div>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={confirmRecognized}>
              Ano, pokračovat
            </button>
            <button className="btn btn-ghost" onClick={() => setStage("manual")}>
              Není to ono
            </button>
          </div>
        </>
      )}

      {stage === "tips" && (
        <>
          <div className="banner warning">
            <span aria-hidden>💡</span>
            <span>Router se nepodařilo automaticky rozpoznat. Zkuste prosím:</span>
          </div>
          <ul style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
            <li>otočit router tak, aby byl vidět celý,</li>
            <li>zvolit kontrastnější, jednobarevné pozadí,</li>
            <li>přisvítit si na router, ať je dobře vidět,</li>
            <li>namířit na zadní stranu se štítkem.</li>
          </ul>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={beginScanning}>
              Zkusit znovu
            </button>
            <button className="btn btn-ghost" onClick={() => setStage("label")}>
              Naskenovat štítek
            </button>
          </div>
          <div className="cta-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" onClick={() => setStage("manual")}>
              Vybrat router ručně
            </button>
          </div>
        </>
      )}

      {stage === "label" && (
        <>
          <p className="lead">
            Namiřte kameru na štítek na zadní straně routeru a podle
            vytištěného modelu jej vyberte ze seznamu.
          </p>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={() => setStage("manual")}>
              Vidím štítek, vybrat model
            </button>
            <button className="btn btn-ghost" onClick={beginScanning}>
              Zkusit automatické rozpoznání znovu
            </button>
          </div>
        </>
      )}

      {stage === "manual" && (
        <>
          <p className="lead">Vyberte model routeru ze seznamu:</p>
          <div className="router-card-grid">
            {ROUTERS.map((r) => (
              <div className="router-card" key={r.id} onClick={() => pickManual(r.id)}>
                <img src={r.image} alt={r.name} />
                <b>{r.name}</b>
                <span>{r.subtitle}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </StepShell>
  );
}
