"use client";

import { useRouter } from "next/navigation";
import { FLOW_STEPS, stepIndex } from "@/lib/flow";
import { useSessionStore } from "@/lib/session-store";
import { getRouter } from "@/lib/routers";
import InstallTourLive from "@/components/InstallTourLive";
import InstallTourManual from "@/components/InstallTourManual";

export default function InstallPage() {
  const nav = useRouter();
  const routerId = useSessionStore((s) => s.routerId);
  const consentGranted = useSessionStore((s) => s.consentGranted);
  const patch = useSessionStore((s) => s.patch);
  const routerModel = getRouter(routerId);

  // No trained detector for this router, or the customer skipped camera
  // consent: fall back to a manual, still fully guided, checklist.
  const manual = !routerModel.hasDetectionModel || consentGranted === false;
  const idx = stepIndex("install");

  const handleDone = (ledOk: boolean) => {
    patch({ ledOk });
    nav.push("/done");
  };
  const handleBack = () => nav.push(consentGranted === false ? "/fallback" : "/confirm");

  return (
    <div className="step-page">
      <div className="step-progress">
        {FLOW_STEPS.map((s, i) => (
          <div key={s} className={`seg ${i < idx ? "done" : i === idx ? "current" : ""}`} />
        ))}
      </div>
      {manual ? (
        <InstallTourManual router={routerModel} onDone={handleDone} onBack={handleBack} />
      ) : (
        <InstallTourLive router={routerModel} onDone={handleDone} onBack={handleBack} />
      )}
    </div>
  );
}
