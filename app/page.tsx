"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HudState } from "@/lib/hud";

type Mode = "landing" | "ar" | "sim";

const EMPTY_HUD: HudState = {
  mbps: 0,
  latencyMs: 0,
  bestMbps: 0,
  cells: 0,
  samples: 0,
  tracking: false,
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("landing");
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);

  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ end: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
    if (!xr) {
      setArSupported(false);
      return;
    }
    xr.isSessionSupported("immersive-ar")
      .then((ok) => !cancelled && setArSupported(ok))
      .catch(() => !cancelled && setArSupported(false));
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
    try {
      const { startAR } = await import("@/lib/ar");
      // the overlay div renders as soon as mode !== 'landing'
      await new Promise((r) => requestAnimationFrame(r));
      const overlay = overlayRef.current;
      if (!overlay) throw new Error("Overlay not ready");
      handleRef.current = await startAR({
        overlay,
        onHud: setHud,
        onEnd: reset,
      });
    } catch (e) {
      reset();
      setError(
        e instanceof Error
          ? `Could not start AR: ${e.message}`
          : "Could not start the AR session."
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
      if (!container) throw new Error("Stage not ready");
      handleRef.current = startSim({
        container,
        onHud: setHud,
        onEnd: reset,
      });
    } catch (e) {
      reset();
      setError(
        e instanceof Error
          ? `Could not start the simulation: ${e.message}`
          : "Could not start the simulation."
      );
    }
  }, [reset]);

  const endSession = useCallback(() => {
    handleRef.current?.end();
  }, []);

  // safety: tear down an active session if the component unmounts
  useEffect(() => () => handleRef.current?.end(), []);

  if (mode === "landing") {
    return (
      <main className="landing">
        <div className="hero">
          <span className="badge">WebXR · World Tracking · Live Speed Test</span>
          <h1>
            Walk your room.
            <br />
            <span className="grad">Raise the signal.</span>
          </h1>
          <p>
            An augmented-reality network heatmap. As you walk, the app streams
            test payloads and measures your real download speed. Every 1 m² of
            floor you cross grows a column — up to 2 m tall for the fastest
            connection found — with color from red (slow) to green (fast).
          </p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="cta-row">
          <button
            className="btn btn-primary"
            onClick={startAR}
            disabled={arSupported === false}
          >
            {arSupported === false ? "AR not available here" : "Start AR mapping"}
          </button>
          <button className="btn btn-ghost" onClick={startSim}>
            Desktop simulation
          </button>
        </div>

        <p className="support-note">
          AR mode needs a WebXR device — e.g. Chrome on Android (ARCore) or a
          headset browser — over HTTPS. On desktop, try the simulation: same
          engine, same real speed tests, virtual walker.
        </p>

        <div className="cards">
          <div className="card">
            <div className="icon">🌍</div>
            <h3>World-anchored tracking</h3>
            <p>
              Uses the WebXR <code>local-floor</code> reference space, so
              columns stay glued to the real floor while you move — six degrees
              of freedom, no markers.
            </p>
          </div>
          <div className="card">
            <div className="icon">⚡</div>
            <h3>Real throughput probes</h3>
            <p>
              A Next.js route streams incompressible random payloads with
              caching disabled; payload size adapts to your link so each probe
              takes ~0.7 s.
            </p>
          </div>
          <div className="card">
            <div className="icon">📶</div>
            <h3>1 m² signal columns</h3>
            <p>
              Each square meter keeps its best measurement. Height (max 2 m)
              and color are normalized to the fastest cell of the session.
            </p>
          </div>
        </div>

        <div className="footer">
          Built with Next.js + three.js ·{" "}
          <a href="https://immersiveweb.dev/" target="_blank" rel="noreferrer">
            immersiveweb.dev
          </a>{" "}
          ·{" "}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API"
            target="_blank"
            rel="noreferrer"
          >
            WebXR Device API
          </a>
        </div>
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
              {hud.mbps > 0 ? hud.mbps.toFixed(1) : "–"}
              <small>Mbit/s</small>
            </div>
            <div className="hud-substats">
              <span>
                <b>{hud.latencyMs > 0 ? `${Math.round(hud.latencyMs)} ms` : "–"}</b>
                latency
              </span>
              <span>
                <b>{hud.bestMbps > 0 ? hud.bestMbps.toFixed(1) : "–"}</b>
                best
              </span>
              <span>
                <b>{hud.cells}</b>
                cells
              </span>
              <span>
                <b>{hud.samples}</b>
                probes
              </span>
            </div>
            <div className="hud-track">
              <span className={hud.tracking ? "dot" : "dot lost"} />
              {hud.tracking ? "tracking" : "acquiring tracking…"}
            </div>
          </div>
          <button className="btn-end" onClick={endSession}>
            End
          </button>
        </div>

        <div className="hud-bottom">
          <div className="legend">
            <div className="legend-title">Best speed per 1 m² cell</div>
            <div className="legend-bar" />
            <div className="legend-scale">
              <span>slow · 0 m</span>
              <span>session best · 2 m</span>
            </div>
            <div className="hint">
              {mode === "ar"
                ? "Walk around — columns grow where you have been."
                : "Drag to orbit · scroll to zoom — the probe walks on its own."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
