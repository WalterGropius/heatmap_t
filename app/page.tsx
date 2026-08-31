"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HudState } from "@/lib/hud";
import { watchConnection, type ConnectionKind } from "@/lib/network";

type Mode = "landing" | "ar" | "sim";

const EMPTY_HUD: HudState = {
  mbps: 0,
  latencyMs: 0,
  bestMbps: 0,
  cells: 0,
  samples: 0,
  tracking: false,
};

const CONN_LABEL: Record<ConnectionKind, string> = {
  wifi: "Wi-Fi",
  cellular: "Mobilní síť",
  ethernet: "Kabel",
  unknown: "Typ sítě neznámý",
};

const nf = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export default function Home() {
  const [mode, setMode] = useState<Mode>("landing");
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [conn, setConn] = useState<ConnectionKind>("unknown");
  const [pendingMode, setPendingMode] = useState<"ar" | "sim" | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ end: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
    if (!xr) {
      setArSupported(false);
    } else {
      xr.isSessionSupported("immersive-ar")
        .then((ok) => !cancelled && setArSupported(ok))
        .catch(() => !cancelled && setArSupported(false));
    }
    const unwatch = watchConnection(setConn);
    return () => {
      cancelled = true;
      unwatch();
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
    try {
      const { startAR } = await import("@/lib/ar");
      // the overlay div renders as soon as mode !== 'landing'
      await new Promise((r) => requestAnimationFrame(r));
      const overlay = overlayRef.current;
      if (!overlay) throw new Error("Overlay není připraven");
      handleRef.current = await startAR({
        overlay,
        onHud: setHud,
        onEnd: reset,
      });
    } catch (e) {
      reset();
      setError(
        e instanceof Error
          ? `AR se nepodařilo spustit: ${e.message}`
          : "AR relaci se nepodařilo spustit."
      );
    }
  }, [reset]);

  const startSim = useCallback(async () => {
    setError(null);
    setHud({ ...EMPTY_HUD, tracking: true });
    setMode("sim");
    try {
      const { startSim } = await import("@/lib/sim");
      await new Promise((r) => requestAnimationFrame(r));
      const container = stageRef.current;
      if (!container) throw new Error("Scéna není připravena");
      handleRef.current = startSim({
        container,
        onHud: setHud,
        onEnd: reset,
      });
    } catch (e) {
      reset();
      setError(
        e instanceof Error
          ? `Simulaci se nepodařilo spustit: ${e.message}`
          : "Simulaci se nepodařilo spustit."
      );
    }
  }, [reset]);

  const confirmStart = useCallback(() => {
    const m = pendingMode;
    setPendingMode(null);
    if (m === "ar") void startAR();
    else if (m === "sim") void startSim();
  }, [pendingMode, startAR, startSim]);

  const endSession = useCallback(() => {
    handleRef.current?.end();
  }, []);

  // safety: tear down an active session if the component unmounts
  useEffect(() => () => handleRef.current?.end(), []);

  if (mode === "landing") {
    return (
      <main className="landing">
        <div className="hero">
          <span className="badge">WebXR · Měření pokrytí</span>
          <h1>
            Projděte místnost.
            <br />
            <span className="grad">Nechte signál růst.</span>
          </h1>
          <p>
            Aplikace při chůzi průběžně měří skutečnou rychlost stahování a na
            každém čtverečním metru podlahy nechá vyrůst sloupec — až 2 m
            vysoký pro nejrychlejší naměřené připojení, barevně od červené po
            zelenou. Tři nejlepší místa svítí magentou.
          </p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="cta-row">
          <button
            className="btn btn-primary"
            onClick={() => setPendingMode("ar")}
            disabled={arSupported === false}
          >
            {arSupported === false ? "AR zde není k dispozici" : "Spustit AR měření"}
          </button>
          <button className="btn btn-ghost" onClick={() => setPendingMode("sim")}>
            Simulace v prohlížeči
          </button>
        </div>

        <p className="support-note">
          AR režim vyžaduje zařízení s podporou WebXR — např. Chrome na
          Androidu (ARCore) nebo prohlížeč v headsetu — a HTTPS. Na počítači
          poslouží simulace se stejným enginem i skutečným měřením.
        </p>

        <div className="footer">Next.js · three.js · WebXR Device API</div>

        {pendingMode && (
          <div className="modal-backdrop" onClick={() => setPendingMode(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Než začnete měřit</h2>
              <p>
                Vypněte Wi-Fi a zkontrolujte, že jste připojeni přes mobilní
                data v síti T-Mobile. Prohlížeč nedokáže zjistit operátora,
                takže správná síť je na vás.
              </p>
              <div className={`conn-warn ${conn}`}>
                {conn === "wifi" &&
                  "Zařízení je právě na Wi-Fi — před měřením ji vypněte."}
                {conn === "cellular" &&
                  "Zařízení je na mobilních datech — můžete začít."}
                {conn === "ethernet" &&
                  "Zařízení je na kabelovém připojení."}
                {conn === "unknown" &&
                  "Typ připojení se nepodařilo zjistit — zkontrolujte ho ručně."}
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setPendingMode(null)}>
                  Zrušit
                </button>
                <button className="btn btn-primary" onClick={confirmStart}>
                  Pokračovat
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
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
                <b>{hud.latencyMs > 0 ? `${Math.round(hud.latencyMs)} ms` : "–"}</b>
                odezva
              </span>
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
              <span className={`conn-chip ${conn}`}>{CONN_LABEL[conn]}</span>
            </div>
          </div>
          <button className="btn-end" onClick={endSession}>
            Ukončit
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
              {mode === "ar"
                ? "Choďte po místnosti — sloupce rostou tam, kde jste byli."
                : "Tažením otáčejte · kolečkem přibližujte — sonda chodí sama."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
