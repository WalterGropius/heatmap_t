"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/session-store";
import { getRouter } from "@/lib/routers";
import { AppBar } from "@/components/StepShell";
import InstallTourLive from "@/components/InstallTourLive";
import InstallTourManual from "@/components/InstallTourManual";

export default function InstallPage() {
  const nav = useRouter();
  const routerId = useSessionStore((s) => s.routerId);
  const consentGranted = useSessionStore((s) => s.consentGranted);
  const patch = useSessionStore((s) => s.patch);
  const routerModel = getRouter(routerId);
  const [cameraFailed, setCameraFailed] = useState(false);

  // No trained detector for this router, the customer skipped camera
  // consent, or the camera/model would not start: fall back to a manual,
  // still fully guided, checklist.
  const manual = !routerModel.hasDetectionModel || consentGranted === false || cameraFailed;

  const handleDone = (ledOk: boolean) => {
    patch({ ledOk });
    nav.push("/done");
  };
  const handleBack = () => nav.push(consentGranted === false ? "/fallback" : "/confirm");

  if (!manual) {
    return (
      <InstallTourLive
        router={routerModel}
        onDone={handleDone}
        onBack={handleBack}
        onCameraUnavailable={() => setCameraFailed(true)}
      />
    );
  }

  return (
    <div className="step-page">
      <AppBar step="install" />
      <InstallTourManual router={routerModel} onDone={handleDone} onBack={handleBack} />
    </div>
  );
}
