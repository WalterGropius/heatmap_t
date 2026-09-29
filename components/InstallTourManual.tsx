"use client";

import { useState } from "react";
import type { RouterModel, StepHighlight } from "@/lib/routers";
import Banner from "./Banner";
import Icon, { type IconName } from "./Icon";

const ICONS: Record<NonNullable<StepHighlight["icon"]>, IconName> = {
  power: "plug",
  sim: "sim",
  button: "power",
  led: "led",
};

type LedChoice = "ok" | "off" | "weak";

const LED_OPTIONS: { id: LedChoice; label: string }[] = [
  { id: "ok", label: "LED svítí zeleně / OK" },
  { id: "weak", label: "LED svítí, ale signál je slabý" },
  { id: "off", label: "LED nesvítí" },
];

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
  const [ledChoice, setLedChoice] = useState<LedChoice | null>(null);
  const step = router.steps[stepIdx];
  const isLast = stepIdx === router.steps.length - 1;
  const isLedStep = step.key === "led";
  const canAdvance = isLedStep ? ledChoice !== null : true;
  const highlight = step.highlights[0];

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
    <>
      <div className="step-body">
        <div className="tour-steps" aria-hidden>
          {router.steps.map((s, i) => (
            <span key={s.key} className={i < stepIdx ? "done" : i === stepIdx ? "current" : ""}>
              {s.shortTitle}
            </span>
          ))}
        </div>
        <p className="step-eyebrow">
          Manuální režim · Krok {stepIdx + 1} z {router.steps.length}
        </p>
        <h1>{step.title}</h1>
        <p className="lead">{step.description}</p>

        <div className="manual-art">
          {highlight?.image ? (
            <img src={highlight.image} alt="" />
          ) : (
            <Icon name={ICONS[highlight?.icon ?? "power"]} size={72} strokeWidth={1.5} />
          )}
        </div>

        {isLedStep ? (
          <div className="option-list" role="radiogroup" aria-label="Stav LED">
            {LED_OPTIONS.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={ledChoice === o.id}
                className={`option-card ${ledChoice === o.id ? "selected" : ""}`}
                onClick={() => setLedChoice(o.id)}
              >
                <b>{o.label}</b>
                <span className="radio" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <Banner tone="info" icon="checkCircle">
            Až bude krok hotový, potvrďte tlačítkem níže.
          </Banner>
        )}

        {isLedStep && ledChoice === "off" && <Banner tone="error">{router.led.offCopy}</Banner>}
        {isLedStep && ledChoice === "weak" && <Banner tone="warning">{router.led.weakSignalCopy}</Banner>}
      </div>

      <div className="step-footer-wrap">
        <div className="step-footer">
          <button className="btn btn-ghost btn-back" onClick={back}>
            Zpět
          </button>
          <button className="btn btn-primary" disabled={!canAdvance} onClick={next}>
            {isLast ? "Dokončit instalaci" : "Hotovo, další krok"}
          </button>
        </div>
      </div>
    </>
  );
}
