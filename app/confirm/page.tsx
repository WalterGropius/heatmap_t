"use client";

import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import Banner from "@/components/Banner";
import { SignalBars } from "@/components/Icon";
import { useSessionStore, type PlaceRating } from "@/lib/session-store";
import { confirmPlacement } from "@/lib/tmcz";

const RATING: Record<PlaceRating, { label: string; bars: 1 | 3 | 4; note: string }> = {
  nevhodne: {
    label: "Slabý signál",
    bars: 1,
    note: "Nemusí jít o chybu — v některých bytech je to nejlepší dostupný stav. Můžete ale zkusit najít lepší místo.",
  },
  pouzitelne: { label: "Použitelné místo", bars: 3, note: "Router tu bude fungovat spolehlivě." },
  doporucene: { label: "Doporučené místo", bars: 4, note: "Tady má router nejlepší podmínky." },
};

const nf1 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function ConfirmPlacePage() {
  const nav = useRouter();
  const sessionId = useSessionStore((s) => s.sessionId);
  const fallbackNoMeasurement = useSessionStore((s) => s.fallbackNoMeasurement);
  const placeRating = useSessionStore((s) => s.placeRating);
  const bestMbps = useSessionStore((s) => s.bestMbps);
  const patch = useSessionStore((s) => s.patch);
  const rating = RATING[placeRating ?? "pouzitelne"];

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
      <p className="step-eyebrow">Potvrzení místa</p>
      <h1>Umístit router právě sem?</h1>

      {fallbackNoMeasurement ? (
        <Banner tone="info" icon="compass">
          Umístění bylo doporučeno podle směru k vysílači, bez měření síly signálu.
        </Banner>
      ) : (
        <div className="place-card">
          <SignalBars level={rating.bars} size={48} />
          <div>
            <b>{rating.label}</b>
            <span>
              {bestMbps ? `Naměřeno až ${nf1.format(bestMbps)} Mbit/s. ` : ""}
              {rating.note}
            </span>
          </div>
        </div>
      )}

      <p className="lead">
        Pokud tohle místo vyhovuje, pokračujeme k zapojení SIM karty, kabelů a
        zapnutí routeru. Pokud chcete zkusit jiné místo, vrátíme vás k měření.
      </p>
    </StepShell>
  );
}
