"use client";

import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { useSessionStore } from "@/lib/session-store";
import { confirmPlacement } from "@/lib/tmcz";

const RATING_LABEL: Record<string, string> = {
  nevhodne: "Slabý signál",
  pouzitelne: "Použitelné místo",
  doporucene: "Doporučené místo",
};

const RATING_BANNER: Record<string, string> = {
  nevhodne: "warning",
  pouzitelne: "info",
  doporucene: "success",
};

export default function ConfirmPlacePage() {
  const nav = useRouter();
  const sessionId = useSessionStore((s) => s.sessionId);
  const fallbackNoMeasurement = useSessionStore((s) => s.fallbackNoMeasurement);
  const placeRating = useSessionStore((s) => s.placeRating);
  const bestMbps = useSessionStore((s) => s.bestMbps);
  const patch = useSessionStore((s) => s.patch);

  const accept = () => {
    const confirmedAt = Date.now();
    patch({ confirmedPlace: true, confirmedAt });
    void confirmPlacement(sessionId, true);
    nav.push("/install");
  };

  const reject = () => {
    const confirmedAt = Date.now();
    patch({ confirmedPlace: false, confirmedAt });
    void confirmPlacement(sessionId, false);
    nav.push("/locate");
  };

  return (
    <StepShell
      step="confirm"
      footer={
        <>
          <button className="btn btn-ghost btn-back" onClick={reject}>
            Zvolit jinde
          </button>
          <button className="btn btn-primary" onClick={accept}>
            Ano, umístit sem
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Krok 5 · Potvrzení místa</p>
      <h1>Umístit router právě sem?</h1>

      {fallbackNoMeasurement ? (
        <div className="banner info">
          <span aria-hidden>🧭</span>
          <span>Umístění bylo doporučeno podle směru k vysílači, bez měření síly signálu.</span>
        </div>
      ) : (
        <div className={`banner ${RATING_BANNER[placeRating ?? "pouzitelne"]}`}>
          <span aria-hidden>📶</span>
          <span>
            {RATING_LABEL[placeRating ?? "pouzitelne"]}
            {bestMbps ? ` — naměřeno až ${bestMbps.toFixed(1)} Mbit/s.` : "."}
          </span>
        </div>
      )}

      <p className="lead">
        Pokud tohle místo vyhovuje, pokračujeme k zapojení SIM karty, kabelů a
        zapnutí routeru. Pokud chcete zkusit jiné místo, vrátíme vás k
        měření.
      </p>
    </StepShell>
  );
}
