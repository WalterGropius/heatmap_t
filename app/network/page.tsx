"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { watchConnection, type ConnectionKind } from "@/lib/network";
import { useSessionStore } from "@/lib/session-store";
import Banner from "@/components/Banner";

const CONN_LABEL: Record<ConnectionKind, string> = {
  wifi: "Wi-Fi",
  cellular: "Mobilní síť",
  ethernet: "Kabel",
  unknown: "Typ sítě se nepodařilo zjistit",
};

const CHOICES = [
  { id: "yes", label: "Ano, T-Mobile" },
  { id: "no", label: "Ne, jiný operátor" },
  { id: "unknown", label: "Nevím" },
] as const;

export default function NetworkCheckPage() {
  const nav = useRouter();
  const patch = useSessionStore((s) => s.patch);
  const [conn, setConn] = useState<ConnectionKind>("unknown");
  const [choice, setChoice] = useState<"yes" | "no" | "unknown" | null>(null);

  useEffect(() => watchConnection(setConn), []);

  const tmobileConfirmed = choice === "yes";
  const measurementCapable = conn === "cellular" && tmobileConfirmed;
  const canContinue = choice !== null;

  const proceed = () => {
    patch({
      connectionKind: conn,
      tmobileConfirmed,
      measurementCapable,
      fallbackNoMeasurement: !measurementCapable,
    });
    nav.push("/compass");
  };

  return (
    <StepShell
      step="network"
      footer={
        <>
          <button className="btn btn-ghost btn-back" onClick={() => nav.back()}>
            Zpět
          </button>
          <button className="btn btn-primary" disabled={!canContinue} onClick={proceed}>
            Pokračovat
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Připojení</p>
      <h1>Zkontrolujeme vaše připojení</h1>
      <p className="lead">
        Měření síly signálu má smysl jen na mobilních datech T-Mobile — SIM
        konkurenčního operátora bychom měřili zbytečně, a Wi-Fi neříká nic o
        pokrytí mobilní sítí.
      </p>

      <Banner tone={conn === "wifi" ? "warning" : conn === "cellular" ? "success" : "info"} icon={conn === "wifi" ? "wifi" : "signal"}>
        Aktuálně zjištěno: <b>{CONN_LABEL[conn]}</b>
        {conn === "wifi" && " — pro měření prosím vypněte Wi-Fi."}
      </Banner>

      <p className="question">Máte zapnutá mobilní data v síti T-Mobile?</p>
      <div className="option-list" role="radiogroup">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={choice === c.id}
            className={`option-card ${choice === c.id ? "selected" : ""}`}
            onClick={() => setChoice(c.id)}
          >
            <b>{c.label}</b>
            <span className="radio" aria-hidden />
          </button>
        ))}
      </div>

      {choice && choice !== "yes" && (
        <Banner tone="warning" icon="info">
          Bez mobilních dat T-Mobile přeskočíme měření síly signálu a
          doporučíme umístění jen podle směru k vysílači.
        </Banner>
      )}
    </StepShell>
  );
}
