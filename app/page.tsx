"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/lib/session-store";
import BrandMark from "@/components/BrandMark";
import Icon, { type IconName } from "@/components/Icon";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "camera", title: "Rozpoznáme router", body: "Stačí na něj namířit kameru telefonu." },
  {
    icon: "signal",
    title: "Najdeme nejsilnější signál",
    body: "Signál namalujeme na podlahu vašeho bytu a ukážeme, kam router postavit.",
  },
  { icon: "plug", title: "Provedeme zapojením", body: "SIM karta, kabely, zapnutí a kontrola kontrolek." },
];

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
      <section className="landing-hero">
        <div className="landing-top">
          <BrandMark inverted size={34} />
          <span>Instalace routeru</span>
        </div>
        <div className="landing-copy">
          <span className="badge">Internet na doma · AR průvodce</span>
          <h1>
            Zapojíme váš router.
            <br />
            Krok za krokem.
          </h1>
          <p>
            Rozšířená realita vám pomůže poznat router, najde místo s nejsilnějším
            signálem a provede vás zapojením — až do chvíle, kdy jste v síti T-Mobile.
          </p>
        </div>
        <img className="landing-product" src="/router-xiaomi/router.png" alt="" />
      </section>

      <div className="landing-body">
        <ol className="landing-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="ico">
                <Icon name={step.icon} />
              </span>
              <div>
                <b>{step.title}</b>
                <span>{step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        <button className="btn btn-primary btn-block" onClick={() => router.push("/consent")}>
          Spustit instalaci
        </button>

        <p className="support-note">
          Budeme potřebovat přístup ke kameře, poloze a orientaci telefonu, aby
          vám průvodce dokázal doporučit nejlepší umístění routeru.
        </p>

        <div className="footer">FWA AR instalace · T-Mobile</div>
      </div>
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
