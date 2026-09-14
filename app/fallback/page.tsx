"use client";

import { useRouter } from "next/navigation";

export default function FallbackPage() {
  const router = useRouter();

  return (
    <main className="landing">
      <div className="hero">
        <span className="badge">Zjednodušený režim</span>
        <h1>Bez měření to taky zvládneme.</h1>
        <p>
          Bez povolení polohy a kamery vám neumíme přesně doporučit místo ani
          automaticky rozpoznat router — ale zapojením vás stále provedeme
          ručně, krok za krokem.
        </p>
      </div>

      <div className="banner info" style={{ maxWidth: 480 }}>
        <span aria-hidden>💡</span>
        <span>
          Obecné doporučení: router funguje nejlépe volně na parapetu nebo u
          okna, pokud možno směrem ven z bytu. Žádná měření ani poloha se v
          tomto režimu nikam neodesílají.
        </span>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary" onClick={() => router.push("/install")}>
          Pokračovat k zapojení
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/consent")}>
          Zpět na souhlasy
        </button>
      </div>
    </main>
  );
}
