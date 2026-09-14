import type { ReactNode } from "react";
import { FLOW_STEPS, stepIndex, type FlowStep } from "@/lib/flow";

export default function StepShell({
  step,
  children,
  footer,
}: {
  step: FlowStep;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const idx = stepIndex(step);
  return (
    <div className="step-page">
      <div className="step-progress">
        {FLOW_STEPS.map((s, i) => (
          <div key={s} className={`seg ${i < idx ? "done" : i === idx ? "current" : ""}`} />
        ))}
      </div>
      <div className="step-body">{children}</div>
      {footer && <div className="step-footer">{footer}</div>}
    </div>
  );
}
