/** Ordered steps of the FWA AR installer, used to render step progress. */
export const FLOW_STEPS = [
  "consent",
  "router",
  "network",
  "compass",
  "locate",
  "confirm",
  "install",
  "done",
] as const;

export type FlowStep = (typeof FLOW_STEPS)[number];

export function stepIndex(step: FlowStep): number {
  return FLOW_STEPS.indexOf(step);
}

/** The steps the customer sees numbered ("Krok 2 z 6"); consent comes before, done after. */
const NUMBERED: readonly FlowStep[] = ["router", "network", "compass", "locate", "confirm", "install"];
export const NUMBERED_STEP_COUNT = NUMBERED.length;

/** 1-based number shown to the customer, or null for the unnumbered consent/done screens. */
export function stepNumber(step: FlowStep): number | null {
  const i = NUMBERED.indexOf(step);
  return i === -1 ? null : i + 1;
}

/** Fraction of the flow completed once `step` is on screen, for progress bars. */
export function stepProgress(step: FlowStep): number {
  return (stepIndex(step) + 1) / FLOW_STEPS.length;
}
