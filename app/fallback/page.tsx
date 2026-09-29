"use client";

import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import Banner from "@/components/Banner";

export default function FallbackPage() {
  const router = useRouter();

  return (
    <StepShell
      step="consent"
      footer={
        <>
          <button className="btn btn-ghost btn-back" onClick={() => router.push("/consent")}>
            Zpět
          </button>
          <button className="btn btn-primary" onClick={() => router.push("/install")}>
            Pokračovat k zapojení
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Zjednodušený režim</p>
      <h1>Bez měření to taky zvládneme.</h1>
      <p className="lead">
        Bez povolení polohy a kamery vám neumíme přesně doporučit místo ani
        automaticky rozpoznat router — ale zapojením vás stále provedeme
        ručně, krok za krokem.
      </p>

      <Banner tone="info" icon="bulb">
        Obecné doporučení: router funguje nejlépe volně na parapetu nebo u
        okna, pokud možno směrem ven z bytu. Žádná měření ani poloha se v
        tomto režimu nikam neodesílají.
      </Banner>
    </StepShell>
  );
}
