"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import type { HudState } from "@/lib/hud";
import { useSessionStore, type PlaceRating } from "@/lib/session-store";
import { buildTmczPayload, submitInstallData } from "@/lib/tmcz";

type Mode = "landing" | "ar" | "sim";

const EMPTY_HUD: HudState = { mbps: 0, latencyMs: 0, bestMbps: 0, cells: 0, samples: 0, tracking: false };
const MIN_SAMPLES_TO_CONFIRM = 2;

const nf = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function rate(bestMbps: number): PlaceRating {
  if (bestMbps < 10) return "nevhodne";
  if (bestMbps < 50) return "pouzitelne";
  return "doporucene";
}

const RATING_COPY: Record<PlaceRating, string> = {
  nevhodne: "Slabý signál",
  pouzitelne: "Použitelné místo",
  doporucene: "Doporučené místo",
};

export default function LocatePage() {
  const nav = useRouter();
  const measurementCapable = useSessionStore((s) => s.measurementCapable);
  const patch = useSessionStore((s) => s.patch);

  const finish = useCallback(
    (hud: HudState, fallback: boolean) => {
      const current = useSessionStore.getState();
      const placeRating = fallback ? null : rate(hud.bestMbps);
      const updates = {
        measureStartAt: current.measureStartAt ?? Date.now(),
        bestMbps: fallback ? null : hud.bestMbps,
        cellCount: fallback ? null : hud.cells,
        sampleCount: fallback ? null : hud.samples,
        placeRating,
        fallbackNoMeasurement: fallback,
      };
      patch(updates);
      const payload = buildTmczPayload({ ...current, ...updates });
      void submitInstallData(payload).then((ok) => {
        if (ok) patch({ dataSentAt: payload.dataSentAt });
      });
      nav.push("/confirm");
    },
    [nav, patch]
  );

  if (measurementCapable === false) {
    return <NoMeasureFlow onConfirm={() => finish(EMPTY_HUD, true)} />;
  }

  return <MeasureFlow onConfirm={(hud) => finish(hud, false)} />;
}

function NoMeasureFlow({ onConfirm }: { onConfirm: () => void }) {
  const nav = useRouter();
  return (
    <StepShell
      step="locate"
      footer={
        <>
          <button className="btn btn-ghost btn-back" onClick={() => nav.back()}>
            Zpět
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Potvrdit toto místo
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Krok 4 · Ideální místo</p>
      <h1>Doporučené umístění</h1>
      <div className="banner info">
        <span aria-hidden>🧭</span>
        <span>
          Bez měření síly signálu doporučujeme místo podle směru z předchozího
          kroku — nejčastěji u okna nebo na parapetu směrem k vysílači.
        </span>
      </div>
      <p className="lead">Až budete na místě, které vám vyhovuje, potvrďte to tlačítkem níže.</p>
    </StepShell>
  );
}

function MeasureFlow({ onConfirm }: { onConfirm: (hud: HudState) => void }) {
  const nav = useRouter();
  const patch = useSessionStore((s) => s.patch);
  const [mode, setMode] = useState<Mode>("landing");
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);

  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ end: () => void } | null>(null);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    let cancelled = false;
    const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
    if (!xr) setArSupported(false);
    else xr.isSessionSupported("immersive-ar").then((ok) => !cancelled && setArSupported(ok)).catch(() => !cancelled && setArSupported(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback(() => {
    handleRef.current = null;
    setMode("landing");
    setHud(EMPTY_HUD);
  }, []);

  const startAR = useCallback(async () => {
    setError(null);
    setHud(EMPTY_HUD);
    setMode("ar");
    patch({ measureStartAt: Date.now() });
    try {
      const { startAR: run } = await import("@/lib/ar");
      await new Promise((r) => requestAnimationFrame(r));
      const overlay = overlayRef.current;
      if (!overlay) throw new Error("Overlay není připraven");
      handleRef.current = await run({ overlay, onHud: setHud, onEnd: reset });
    } catch (e) {
      reset();
      setError(e instanceof Error ? `AR se nepodařilo spustit: ${e.message}` : "AR relaci se nepodařilo spustit.");
    }
  }, [reset, patch]);

  const startSim = useCallback(async () => {
    setError(null);
    setHud({ ...EMPTY_HUD, tracking: true });
    setMode("sim");
    patch({ measureStartAt: Date.now() });
    try {
      const { startSim: run } = await import("@/lib/sim");
      await new Promise((r) => requestAnimationFrame(r));
      const container = stageRef.current;
      if (!container) throw new Error("Scéna není připravena");
      handleRef.current = run({ container, onHud: setHud, onEnd: reset });
    } catch (e) {
      reset();
      setError(e instanceof Error ? `Simulaci se nepodařilo spustit: ${e.message}` : "Simulaci se nepodařilo spustit.");
    }
  }, [reset, patch]);

  const confirmPlace = useCallback(() => {
    const finalHud = hudRef.current;
    const handle = handleRef.current;
    handleRef.current = null;
    handle?.end();
    onConfirm(finalHud);
  }, [onConfirm]);

  const cancelMeasuring = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    handle?.end();
    setMode("landing");
    setHud(EMPTY_HUD);
  }, []);

  useEffect(() => () => handleRef.current?.end(), []);

  if (mode === "landing") {
    return (
      <StepShell
        step="locate"
        footer={
          <button className="btn btn-ghost btn-back" onClick={() => nav.back()}>
            Zpět
          </button>
        }
      >
        <p className="step-eyebrow">Krok 4 · Ideální místo</p>
        <h1>Najdeme nejsilnější signál</h1>
        <p className="lead">
          Projděte místnost — na podlaze porostou sloupce podle naměřené
          rychlosti. Až najdete nejvyšší (magenta) sloupec, stůjte na něm a
          potvrďte místo.
        </p>

        {error && (
          <div className="banner error">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="cta-row">
          <button className="btn btn-primary" onClick={() => void startAR()} disabled={arSupported === false}>
            {arSupported === false ? "AR zde není k dispozici" : "Spustit AR měření"}
          </button>
          <button className="btn btn-ghost" onClick={() => void startSim()}>
            Simulace v prohlížeči
          </button>
        </div>
      </StepShell>
    );
  }

  return (
    <>
      {mode === "sim" && <div ref={stageRef} className="stage" />}
      <div ref={overlayRef} className="hud">
        <div className="hud-top">
          <div className="hud-panel">
            <div className="hud-speed">
              {hud.mbps > 0 ? nf.format(hud.mbps) : "–"}
              <small>Mbit/s</small>
            </div>
            <div className="hud-substats">
              <span>
                <b>{hud.bestMbps > 0 ? nf.format(hud.bestMbps) : "–"}</b>
                maximum
              </span>
              <span>
                <b>{hud.cells}</b>
                buněk
              </span>
              <span>
                <b>{hud.samples}</b>
                měření
              </span>
            </div>
            <div className="hud-meta">
              <span className="hud-track">
                <span className={hud.tracking ? "dot" : "dot lost"} />
                {hud.tracking ? "sledování" : "hledám polohu…"}
              </span>
            </div>
          </div>
          <button className="btn-end" onClick={cancelMeasuring}>
            Zrušit
          </button>
        </div>

        <div className="hud-bottom">
          <div className="legend">
            <div className="legend-title">Nejlepší rychlost na buňku 1 m²</div>
            <div className="legend-bar" />
            <div className="legend-scale">
              <span>pomalé · 0 m</span>
              <span>maximum relace · 2 m</span>
            </div>
            <div className="legend-top3">
              <span className="swatch" />3 nejrychlejší buňky
            </div>
            <div className="hint">
              {mode === "ar" ? "Choďte po místnosti — sloupce rostou tam, kde jste byli." : "Tažením otáčejte · kolečkem přibližujte."}
            </div>
          </div>
        </div>
      </div>

      <div className="recommend-card">
        <h3>{hud.samples >= MIN_SAMPLES_TO_CONFIRM ? RATING_COPY[rate(hud.bestMbps)] : "Sbírám první měření…"}</h3>
        <p>
          Stůjte na místě s nejvyšším (magenta) sloupcem a potvrďte ho jako
          finální umístění routeru.
        </p>
        <div className="row">
          <button className="btn btn-primary" disabled={hud.samples < MIN_SAMPLES_TO_CONFIRM} onClick={confirmPlace}>
            Potvrdit toto místo
          </button>
        </div>
      </div>
    </>
  );
}
