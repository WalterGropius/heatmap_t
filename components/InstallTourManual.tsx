"use client";

import { useState } from "react";
import type { RouterModel } from "@/lib/routers";

const ICONS: Record<string, string> = { power: "🔌", sim: "🪪", button: "🔘", led: "💡" };

export default function InstallTourManual({
  router,
  onDone,
  onBack,
}: {
  router: RouterModel;
  onDone: (ledOk: boolean) => void;
  onBack: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [ledChoice, setLedChoice] = useState<"ok" | "off" | "weak" | null>(null);
  const step = router.steps[stepIdx];
  const isLast = stepIdx === router.steps.length - 1;
  const isLedStep = step.key === "led";
  const canAdvance = isLedStep ? ledChoice !== null : true;

  const next = () => {
    if (isLast) {
      onDone(ledChoice === "ok");
      return;
    }
    setStepIdx((i) => i + 1);
    setLedChoice(null);
  };

  const back = () => {
    if (stepIdx === 0) {
      onBack();
      return;
    }
    setStepIdx((i) => i - 1);
    setLedChoice(null);
  };

  return (
    <div className="step-body" style={{ paddingTop: 8, flex: 1, overflowY: "auto" }}>
      <p className="step-eyebrow">
        Manuální režim · Krok {stepIdx + 1}/{router.steps.length}
      </p>
      <h1>{step.title}</h1>
      <p className="lead">{step.description}</p>

      <div
        style={{
          fontSize: 64,
          textAlign: "center",
          margin: "12px 0 20px",
          background: "#f5f5f5",
          borderRadius: 16,
          padding: "28px 0",
        }}
        aria-hidden
      >
        {ICONS[step.highlights[0]?.icon ?? "power"]}
      </div>

      {isLedStep ? (
        <div className="option-list">
          <div className={`option-card ${ledChoice === "ok" ? "selected" : ""}`} onClick={() => setLedChoice("ok")}>
            <b>LED svítí zeleně / OK</b>
          </div>
          <div className={`option-card ${ledChoice === "weak" ? "selected" : ""}`} onClick={() => setLedChoice("weak")}>
            <b>LED svítí, ale signál je slabý</b>
          </div>
          <div className={`option-card ${ledChoice === "off" ? "selected" : ""}`} onClick={() => setLedChoice("off")}>
            <b>LED nesvítí</b>
          </div>
        </div>
      ) : (
        <div className="banner success">
          <span aria-hidden>✅</span>
          <span>Až bude krok hotový, potvrďte tlačítkem níže.</span>
        </div>
      )}

      {isLedStep && ledChoice === "off" && (
        <div className="banner error">
          <span aria-hidden>⚠️</span>
          <span>{router.led.offCopy}</span>
        </div>
      )}
      {isLedStep && ledChoice === "weak" && (
        <div className="banner warning">
          <span aria-hidden>ℹ️</span>
          <span>{router.led.weakSignalCopy}</span>
        </div>
      )}

      <div className="step-footer" style={{ position: "static", border: 0, padding: "20px 0 0" }}>
        <button className="btn btn-ghost btn-back" onClick={back}>
          Zpět
        </button>
        <button className="btn btn-primary" disabled={!canAdvance} onClick={next}>
          {isLast ? "Dokončit instalaci" : "Hotovo, další krok"}
        </button>
      </div>
    </div>
  );
}
