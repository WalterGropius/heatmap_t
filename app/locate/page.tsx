"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import Banner from "@/components/Banner";
import BrandMark from "@/components/BrandMark";
import Icon, { SignalBars, type IconName } from "@/components/Icon";
import { ArIconButton } from "@/components/ArCamera";
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
      <p className="step-eyebrow">Ideální místo</p>
      <h1>Doporučené umístění</h1>
      <Banner tone="info" icon="compass">
        Bez měření síly signálu doporučujeme místo podle směru z předchozího
        kroku — nejčastěji u okna nebo na parapetu směrem k vysílači.
      </Banner>
      <p className="lead">Až budete na místě, které vám vyhovuje, potvrďte to tlačítkem níže.</p>
    </StepShell>
  );
}

/** The one line of copy that tells the customer what to do right now. */
function guidance(hud: HudState, mode: Mode): { text: string; tone: "ok" | "wait" | "go"; icon: IconName } {
  if (hud.samples === 0) return { text: "Spouštím měření signálu…", tone: "wait", icon: "signal" };
  if (mode === "ar" && !hud.tracking)
    return { text: "Hledám polohu — pomalu pohybujte telefonem.", tone: "wait", icon: "scan" };
  if (hud.onBestSpot) return { text: "Stojíte na nejsilnějším místě — sem s routerem!", tone: "ok", icon: "checkCircle" };
  if (hud.distanceToBestM !== null && hud.distanceToBestM >= 1)
    return {
      text: `Nejsilnější místo je ${nf1.format(hud.distanceToBestM)} m odsud — jděte za šipkou k magenta špendlíku.`,
      tone: "go",
      icon: "navigate",
    };
  if (hud.cells < SUGGESTED_CELLS)
    return { text: "Projděte pomalu místnost, ať je co porovnávat.", tone: "go", icon: "walk" };
  return { text: "Pokračujte v hledání silnějšího místa.", tone: "go", icon: "walk" };
}

/**
 * The spot the customer is standing on, as phone-style signal bars and a
 * word. Relative to the best spot measured so far — the rating chip next to
 * it carries the absolute verdict on the best spot.
 */
function hereLevel(hud: HudState): { bars: 0 | 1 | 2 | 3 | 4; word: string } {
  if (hud.samples === 0 || hud.hereMbps <= 0) return { bars: 0, word: "Měřím…" };
  if (hud.onBestSpot || hud.hereScore >= 0.9) return { bars: 4, word: "Nejsilnější místo" };
  if (hud.hereScore >= 0.65) return { bars: 3, word: "Silný signál" };
  if (hud.hereScore >= 0.35) return { bars: 2, word: "Střední signál" };
  return { bars: 1, word: "Slabý signál" };
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
      handleRef.current = run({
        container,
        onHud: setHud,
        onEnd: reset,
        occluder: () => overlayRef.current?.querySelector(".scan-card")?.getBoundingClientRect(),
      });
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
        <p className="step-eyebrow">Ideální místo</p>
        <h1>Najdeme nejsilnější signál</h1>
        <p className="lead">
          Měříme skutečnou rychlost připojení a malujeme ji na podlahu
          místnosti. Čím sytější magenta, tím silnější signál.
        </p>

        <div className="heat-legend" aria-hidden>
          <span>slabší</span>
          <span className="ramp" />
          <span>silnější</span>
        </div>

        <ol className="howto">
          <li>
            <b>Projděte pomalu místnost</b> — každý metr čtvereční se obarví podle síly signálu.
          </li>
          <li>
            <b>Jděte za šipkou</b> k magenta špendlíku — ukazuje dosud nejsilnější místo.
          </li>
          <li>
            <b>Postavte se na něj</b> a potvrďte ho jako umístění routeru.
          </li>
        </ol>

        {error && <Banner tone="error">{error}</Banner>}

        {arSupported === false && (
          <Banner tone="info">
            Toto zařízení nepodporuje AR (WebXR). Spusťte simulaci v prohlížeči —
            měří stejně, jen místností prochází virtuální telefon.
          </Banner>
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
  const level = hereLevel(hud);

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
          <div className="hud-pill" role="status" aria-live="polite">
            <BrandMark size={32} />
            <span className={hud.tracking ? "live" : "live lost"} aria-hidden />
            <span>{!hud.tracking ? "Hledám polohu…" : mode === "ar" ? "Měřím signál" : "Simulace"}</span>
            {hud.mbps > 0 && <small>{fmtSpeed(hud.mbps)} Mbit/s</small>}
          </div>
          <ArIconButton icon="close" label="Zrušit měření" onClick={cancelMeasuring} />
        </div>

        <div className="hud-bottom">
          <div className="scan-card">
            <div className="signal-row">
              <SignalBars level={level.bars} size={42} />
              <div className="signal-text">
                <span className="signal-word">{level.word}</span>
                <span className="signal-sub">
                  {hud.hereMbps > 0 ? `Tady ${fmtSpeed(hud.hereMbps)} Mbit/s` : "Tady zatím neměřeno"}
                </span>
              </div>
            </div>

            {/* The ramp doubles as the legend (same colors as the floor) and
                as the meter: the needle sits where the spot you stand on
                falls between weak and the strongest spot measured so far. */}
            <div
              className="quality-bar"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={herePct}
              aria-label="Síla signálu tady vůči nejsilnějšímu místu"
            >
              <div className="quality-track" />
              {hud.hereMbps > 0 && (
                // inset by the needle's radius so it stays on the track at 0 % and 100 %
                <div className="quality-needle" style={{ left: `calc(9px + (100% - 18px) * ${herePct / 100})` }} />
              )}
            </div>
            <div className="quality-scale">
              <span>slabší</span>
              <span className="quality-legend">
                <Icon name="pin" size={14} strokeWidth={2.5} />
                nejsilnější místo
              </span>
              <span>silnější</span>
            </div>

            <p className={`scan-guide ${guide.tone}`}>
              <Icon name={guide.icon} size={20} />
              <span>{guide.text}</span>
            </p>

            {hud.bestMbps > 0 && (
              <div className="best-line">
                <Icon name="pin" size={18} />
                <span>
                  Nejlépe: <b>{fmtSpeed(hud.bestMbps)} Mbit/s</b>
                </span>
                <span className={`rating-chip ${rating}`}>{RATING_COPY[rating]}</span>
              </div>
            )}

            {!ready && (
              <div className="scan-progress" aria-hidden>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            )}

            <button className="btn btn-primary btn-block" disabled={!ready} onClick={confirmPlace}>
              {ready ? "Potvrdit toto místo" : `Měřím… ${hud.samples}/${MIN_SAMPLES_TO_CONFIRM}`}
            </button>

            {hud.samples > 0 && (
              <p className="scan-details">
                Prošli jste {hud.cells} m² · {hud.samples} měření
                {mode === "sim" && " · tažením otáčejte"}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
