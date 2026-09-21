"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { EMPTY_HUD, type HudState } from "@/lib/hud";
import { useSessionStore, type PlaceRating } from "@/lib/session-store";
import { buildTmczPayload, submitInstallData } from "@/lib/tmcz";

type Mode = "landing" | "ar" | "sim";

/** Samples needed before the place can be confirmed. Two samples is barely two
 *  seconds of data — enough to see a number, not enough to call it a measurement. */
const MIN_SAMPLES_TO_CONFIRM = 5;
/** Below this many mapped cells the customer has not really walked the room yet,
 *  so we nudge (but never block — some flats have nowhere to walk). */
const SUGGESTED_CELLS = 3;

const nf1 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

/** Mbit/s readouts get a decimal only while they are small enough to need one. */
function fmtSpeed(mbps: number): string {
  if (mbps <= 0) return "–";
  return mbps >= 100 ? nf0.format(mbps) : nf1.format(mbps);
}

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

/** The one line of copy that tells the customer what to do right now. */
function guidance(hud: HudState, mode: Mode): { text: string; tone: "ok" | "wait" | "go" } {
  if (hud.samples === 0) return { text: "Spouštím měření rychlosti…", tone: "wait" };
  if (mode === "ar" && !hud.tracking)
    return { text: "Hledám polohu — pomalu pohybujte telefonem.", tone: "wait" };
  if (hud.onBestSpot) return { text: "Stojíte na nejlepším naměřeném místě.", tone: "ok" };
  if (hud.distanceToBestM !== null && hud.distanceToBestM >= 1)
    return {
      text: `Nejlepší místo je ${nf1.format(hud.distanceToBestM)} m odsud — hledejte magenta kruh na podlaze.`,
      tone: "go",
    };
  if (hud.cells < SUGGESTED_CELLS)
    return { text: "Projděte pomalu místnost, ať je co porovnávat.", tone: "go" };
  return { text: "Pokračujte v hledání silnějšího místa.", tone: "go" };
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
          Měříme skutečnou rychlost stahování a zakreslujeme ji na podlahu
          místnosti. Čím vyšší sloupec, tím rychlejší místo.
        </p>

        <ol className="howto">
          <li>
            <b>Projděte pomalu místnost</b> — každý metr čtvereční dostane vlastní sloupec.
          </li>
          <li>
            <b>Sledujte magenta kruh</b> na podlaze — označuje dosud nejrychlejší místo.
          </li>
          <li>
            <b>Postavte se na něj</b> a potvrďte ho jako umístění routeru.
          </li>
        </ol>

        {error && (
          <div className="banner error">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {arSupported === false && (
          <div className="banner info">
            <span aria-hidden>ℹ️</span>
            <span>
              Toto zařízení nepodporuje AR (WebXR). Spusťte simulaci v prohlížeči —
              měří stejně, jen místnost prochází virtuální telefon.
            </span>
          </div>
        )}

        <div className="cta-row">
          <button
            className="btn btn-primary"
            onClick={() => void startAR()}
            disabled={arSupported !== true}
          >
            {arSupported === null
              ? "Zjišťuji podporu AR…"
              : arSupported
                ? "Spustit AR měření"
                : "AR zde není k dispozici"}
          </button>
          <button className="btn btn-ghost" onClick={() => void startSim()}>
            Simulace v prohlížeči
          </button>
        </div>
      </StepShell>
    );
  }

  const ready = hud.samples >= MIN_SAMPLES_TO_CONFIRM;
  const progress = Math.min(1, hud.samples / MIN_SAMPLES_TO_CONFIRM);
  const rating = rate(hud.bestMbps);
  const guide = guidance(hud, mode);
  const herePct = Math.round(Math.min(1, Math.max(0, hud.hereScore)) * 100);

  return (
    <>
      {mode === "sim" && <div ref={stageRef} className="stage" />}
      {/*
        Everything the customer can act on has to live inside this element:
        in immersive AR it is the WebXR dom-overlay root, and nothing outside
        its subtree is composited over the camera feed.
      */}
      <div ref={overlayRef} className="hud">
        <div className="hud-top">
          <div className="hud-panel" role="status" aria-live="polite">
            <div className="hud-mode">{mode === "ar" ? "AR měření" : "Simulace"}</div>
            <div className="hud-speed">
              {fmtSpeed(hud.mbps)}
              <small>Mbit/s</small>
            </div>
            <div className="hud-substats">
              <span>
                <b>{fmtSpeed(hud.bestMbps)}</b>
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
          <div className="scan-card">
            <div className="scan-head">
              <span className={`rating-chip ${rating}`}>
                {hud.samples > 0 ? RATING_COPY[rating] : "Sbírám první měření…"}
              </span>
              {hud.bestMbps > 0 && (
                <span className="scan-pct">
                  zde <b>{herePct} %</b> nejlepšího
                </span>
              )}
            </div>

            {/* The speed gradient doubles as the legend and as the meter: the
                needle sits where the current cell falls between slow and the
                fastest cell measured so far. */}
            <div
              className="quality-bar"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={herePct}
              aria-label="Kvalita aktuálního místa vůči nejlepšímu naměřenému"
            >
              <div className="quality-track" />
              {hud.bestMbps > 0 && (
                // inset by the needle's own width so it stays on the track at 0 % and 100 %
                <div
                  className="quality-needle"
                  style={{ left: `calc(2px + (100% - 4px) * ${herePct / 100})` }}
                />
              )}
            </div>
            <div className="quality-scale">
              <span>pomalé</span>
              <span className="quality-legend">
                <i className="swatch" aria-hidden />3 nejrychlejší buňky
              </span>
              <span>nejrychlejší</span>
            </div>

            <p className={`scan-guide ${guide.tone}`}>{guide.text}</p>

            {!ready && (
              <div className="scan-progress" aria-hidden>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            )}

            <button className="btn btn-primary btn-block" disabled={!ready} onClick={confirmPlace}>
              {ready
                ? "Potvrdit toto místo"
                : `Měřím… ${hud.samples}/${MIN_SAMPLES_TO_CONFIRM}`}
            </button>

            <p className="scan-hint">
              {mode === "ar"
                ? "Choďte po místnosti — sloupce rostou tam, kde jste byli."
                : "Tažením otáčejte · kolečkem přibližujte."}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
