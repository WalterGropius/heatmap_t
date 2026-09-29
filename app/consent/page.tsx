"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { useSessionStore } from "@/lib/session-store";
import Icon, { type IconName } from "@/components/Icon";

const ITEMS: { glyph: IconName; title: string; body: string }[] = [
  {
    glyph: "camera",
    title: "Kamera",
    body: "Pro rozpoznání routeru a navedení při zapojování SIM karty, kabelů a tlačítek.",
  },
  {
    glyph: "pin",
    title: "Poloha",
    body: "Pro výpočet směru a vzdálenosti k vysílači (BTS) a doporučení nejlepšího místa v bytě.",
  },
  {
    glyph: "compass",
    title: "Orientace / kompas",
    body: "Aby vám mohla šipka ukázat, kterým směrem vysílač je.",
  },
  {
    glyph: "data",
    title: "Mobilní data",
    body: "Pro změření kvality připojení v místě, kam chcete router umístit.",
  },
];

async function requestIOSOrientationPermission() {
  const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  if (DOE?.requestPermission) {
    try {
      await DOE.requestPermission();
    } catch {
      // ignored — handled again, contextually, on the compass step
    }
  }
}

async function primeCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // ignored — the router-recognition step will surface a clear retry
  }
}

async function primeLocationPermission() {
  if (!navigator.geolocation) return;
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { timeout: 8000 }
    );
  });
}

export default function ConsentPage() {
  const router = useRouter();
  const patch = useSessionStore((s) => s.patch);
  const [busy, setBusy] = useState(false);

  const allowAll = async () => {
    setBusy(true);
    await Promise.allSettled([primeCameraPermission(), primeLocationPermission(), requestIOSOrientationPermission()]);
    patch({ consentGranted: true, consentDecidedAt: Date.now() });
    setBusy(false);
    router.push("/router");
  };

  const declineAll = () => {
    patch({ consentGranted: false, consentDecidedAt: Date.now(), fallbackNoMeasurement: true });
    router.push("/fallback");
  };

  return (
    <StepShell
      step="consent"
      footer={
        <>
          <button className="btn btn-ghost" onClick={declineAll} disabled={busy}>
            Ukončit
          </button>
          <button className="btn btn-primary" onClick={allowAll} disabled={busy}>
            {busy ? "Chvilku…" : "Povolit vše"}
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Než začneme</p>
      <h1>Povolte průvodci přístup k telefonu</h1>
      <p className="lead">
        Abychom vám mohli doporučit nejlepší umístění routeru a provést vás
        zapojením, potřebujeme jednorázově tato oprávnění. Bez nich průvodce
        poběží ve zjednodušeném režimu bez měření.
      </p>

      <div className="consent-list">
        {ITEMS.map((item) => (
          <div className="consent-item" key={item.title}>
            <div className="glyph" aria-hidden>
              <Icon name={item.glyph} />
            </div>
            <div className="copy">
              <b>{item.title}</b>
              <span>{item.body}</span>
            </div>
          </div>
        ))}
      </div>
    </StepShell>
  );
}
