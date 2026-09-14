"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/lib/session-store";

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patch = useSessionStore((s) => s.patch);

  // 3. Načtení instalačního kontextu — session/order id and the recommended
  // BTS come from the activation link (or, in production, an internal API
  // call keyed by the same session id).
  useEffect(() => {
    const sessionId = searchParams.get("session");
    const orderId = searchParams.get("order");
    const bts = searchParams.get("bts");
    const routerParam = searchParams.get("router");
    const patchData: Record<string, unknown> = {};
    if (sessionId) patchData.sessionId = sessionId;
    if (orderId) patchData.orderId = orderId;
    if (bts) patchData.btsCoordinates = bts;
    if (routerParam) patchData.routerId = routerParam;
    if (Object.keys(patchData).length > 0) patch(patchData);
  }, [searchParams, patch]);

  return (
    <main className="landing">
      <div className="hero">
        <span className="badge">AR průvodce instalací · FWA</span>
        <h1>
          Zapojíme váš router.
          <br />
          <span className="grad">Krok za krokem.</span>
        </h1>
        <p>
          Rozšířená realita vám pomůže poznat router, najde nejlepší místo pro
          co nejsilnější signál a provede vás zapojením SIM karty, kabelů a
          spuštěním — až do chvíle, kdy jste v síti T-Mobile.
        </p>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary" onClick={() => router.push("/consent")}>
          Spustit instalaci
        </button>
      </div>

      <p className="support-note">
        Budeme potřebovat přístup ke kameře, poloze a orientaci telefonu, aby
        vám průvodce dokázal doporučit nejlepší umístění routeru.
      </p>

      <div className="footer">FWA AR instalace · T-Mobile</div>
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingContent />
    </Suspense>
  );
}
