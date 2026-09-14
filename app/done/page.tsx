"use client";

import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/session-store";
import { getRouter } from "@/lib/routers";

const RATING_LABEL: Record<string, string> = {
  nevhodne: "Slabý signál",
  pouzitelne: "Použitelné místo",
  doporucene: "Doporučené místo",
};

export default function DonePage() {
  const nav = useRouter();
  const routerId = useSessionStore((s) => s.routerId);
  const ledOk = useSessionStore((s) => s.ledOk);
  const placeRating = useSessionStore((s) => s.placeRating);
  const bestMbps = useSessionStore((s) => s.bestMbps);
  const sessionId = useSessionStore((s) => s.sessionId);
  const reset = useSessionStore((s) => s.reset);
  const routerModel = getRouter(routerId);

  const success = ledOk !== false;

  const restart = () => {
    reset();
    nav.push("/");
  };

  return (
    <div className="flex-done" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: success ? "var(--magenta)" : "var(--bg)", color: success ? "#fff" : "var(--ink)" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 24px", gap: 18 }}>
        {success ? (
          <>
            <span className="badge" style={{ color: "#fff" }}>
              Zapojení bylo úspěšné ✓
            </span>
            <h1 style={{ fontSize: 32, margin: 0 }}>
              A je to! Váš router
              <br />
              {routerModel.name}
              <br />
              máte úspěšně zapojený.
            </h1>
            <img src={routerModel.image} alt={routerModel.name} style={{ height: 160, marginTop: 10, filter: "drop-shadow(0 10px 20px rgba(0,0,0,.25))" }} />
            {placeRating && (
              <p style={{ opacity: 0.9 }}>
                {RATING_LABEL[placeRating]}
                {bestMbps ? ` · až ${bestMbps.toFixed(1)} Mbit/s` : ""}
              </p>
            )}
          </>
        ) : (
          <>
            <span className="badge">Nedokončeno</span>
            <h1 style={{ fontSize: 28, margin: 0 }}>4G/5G LED zatím nesvítí</h1>
            <p className="lead" style={{ maxWidth: 420 }}>
              {routerModel.led.offCopy} Slabší signál nemusí být chyba — v
              některých bytech jde o nejlepší dostupný stav.
            </p>
            <p className="lead" style={{ maxWidth: 420 }}>
              Pokud problém přetrvává, otevřete aplikaci OneApp nebo
              kontaktujte zákaznickou podporu T-Mobile.
            </p>
          </>
        )}
      </div>

      <div style={{ padding: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {!success && (
          <button className="btn btn-primary" onClick={() => nav.push("/install")}>
            Zkusit znovu
          </button>
        )}
        <button className={success ? "btn" : "btn btn-ghost"} style={success ? { background: "#fff", color: "var(--magenta)" } : undefined} onClick={restart}>
          Spustit instalaci znovu
        </button>
      </div>

      {sessionId && (
        <div style={{ textAlign: "center", fontSize: 11, opacity: 0.6, paddingBottom: 16 }}>Session: {sessionId}</div>
      )}
    </div>
  );
}
