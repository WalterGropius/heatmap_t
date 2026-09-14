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
