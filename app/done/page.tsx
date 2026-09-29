"use client";

import { useRouter } from "next/navigation";
import { useSessionStore, type PlaceRating } from "@/lib/session-store";
import { getRouter } from "@/lib/routers";
import BrandMark from "@/components/BrandMark";
import Icon, { SignalBars } from "@/components/Icon";

const RATING: Record<PlaceRating, { label: string; bars: 1 | 3 | 4 }> = {
  nevhodne: { label: "Slabý signál", bars: 1 },
  pouzitelne: { label: "Použitelné místo", bars: 3 },
  doporucene: { label: "Doporučené místo", bars: 4 },
};

const nf1 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
    <div className={`done-page${success ? " success" : ""}`}>
      <div className="done-top">
        <BrandMark inverted={success} size={34} />
        <span>Instalace routeru</span>
      </div>

      <main className="done-main">
        {success ? (
          <>
            <span className="done-check">
              <Icon name="check" size={38} strokeWidth={3} />
            </span>
            <span className="badge" style={{ color: "#fff" }}>
              Zapojení bylo úspěšné
            </span>
            <h1>A je to! Váš router {routerModel.name} je zapojený.</h1>
            <img className="done-product" src={routerModel.image} alt="" />
            {placeRating && (
              <span className="done-stat">
                <SignalBars level={RATING[placeRating].bars} size={26} />
                {RATING[placeRating].label}
                {bestMbps ? ` · až ${nf1.format(bestMbps)} Mbit/s` : ""}
              </span>
            )}
            <p>Vítejte v síti T-Mobile.</p>
          </>
        ) : (
          <>
            <span className="done-check">
              <Icon name="alert" size={34} />
            </span>
            <span className="badge">Nedokončeno</span>
            <h1>4G/5G LED zatím nesvítí</h1>
            <p style={{ color: "var(--gray)" }}>
              {routerModel.led.offCopy} Slabší signál nemusí být chyba — v
              některých bytech jde o nejlepší dostupný stav.
            </p>
            <p style={{ color: "var(--gray)" }}>
              Pokud problém přetrvává, otevřete aplikaci OneApp nebo
              kontaktujte zákaznickou podporu T-Mobile.
            </p>
          </>
        )}
      </main>

      <div className="done-actions">
        {!success && (
          <button className="btn btn-primary" onClick={() => nav.push("/install")}>
            <Icon name="refresh" size={20} /> Zkusit znovu
          </button>
        )}
        <button className={success ? "btn btn-on-magenta" : "btn btn-ghost"} onClick={restart}>
          Spustit instalaci znovu
        </button>
      </div>

      {sessionId && <div className="done-session">Session: {sessionId}</div>}
    </div>
  );
}
