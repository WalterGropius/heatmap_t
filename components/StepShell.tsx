import type { ReactNode } from "react";
import { NUMBERED_STEP_COUNT, stepNumber, stepProgress, type FlowStep } from "@/lib/flow";
import BrandMark from "./BrandMark";

/** T-Mobile app bar: brand tile, flow title, step counter and a magenta progress line. */
export function AppBar({ step }: { step: FlowStep }) {
  const n = stepNumber(step);
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <BrandMark />
        <span className="appbar-title">Instalace routeru</span>
        <span className="appbar-step">{n ? `Krok ${n} z ${NUMBERED_STEP_COUNT}` : "Než začneme"}</span>
      </div>
      <div
        className="appbar-progress"
        role="progressbar"
        aria-label="Průběh instalace"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(stepProgress(step) * 100)}
      >
        <span style={{ width: `${stepProgress(step) * 100}%` }} />
      </div>
    </header>
  );
}

export default function StepShell({
  step,
  children,
  footer,
}: {
  step: FlowStep;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="step-page">
      <AppBar step={step} />
      <div className="step-body">{children}</div>
      {footer && (
        <div className="step-footer-wrap">
          <div className="step-footer">{footer}</div>
        </div>
      )}
    </div>
  );
}
