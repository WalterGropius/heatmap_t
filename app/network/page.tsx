"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { watchConnection, type ConnectionKind } from "@/lib/network";
import { useSessionStore } from "@/lib/session-store";

const CONN_LABEL: Record<ConnectionKind, string> = {
  wifi: "Wi-Fi",
  cellular: "Mobilní síť",
  ethernet: "Kabel",
  unknown: "Typ sítě se nepodařilo zjistit",
};

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
      <p className="step-eyebrow">Krok 2 · Připojení</p>
      <h1>Zkontrolujeme vaše připojení</h1>
      <p className="lead">
        Měření síly signálu má smysl jen na mobilních datech T-Mobile — SIM
        konkurenčního operátora bychom měřili zbytečně, a Wi-Fi neříká nic o
        pokrytí mobilní sítí.
      </p>

      <div className={`banner ${conn === "wifi" ? "warning" : conn === "cellular" ? "success" : "info"}`}>
        <span aria-hidden>📶</span>
        <span>
          Aktuálně zjištěno: <b>{CONN_LABEL[conn]}</b>
          {conn === "wifi" && " — pro měření prosím vypněte Wi-Fi."}
        </span>
      </div>

      <p style={{ fontWeight: 700, fontSize: 14, margin: "20px 0 10px" }}>
        Máte zapnutá mobilní data v síti T-Mobile?
      </p>
      <div className="option-list">
        <div className={`option-card ${choice === "yes" ? "selected" : ""}`} onClick={() => setChoice("yes")}>
          <b>Ano, T-Mobile</b>
        </div>
        <div className={`option-card ${choice === "no" ? "selected" : ""}`} onClick={() => setChoice("no")}>
          <b>Ne, jiný operátor</b>
        </div>
        <div className={`option-card ${choice === "unknown" ? "selected" : ""}`} onClick={() => setChoice("unknown")}>
          <b>Nevím</b>
        </div>
      </div>

      {choice && choice !== "yes" && (
        <div className="banner warning">
          <span aria-hidden>ℹ️</span>
          <span>
            Bez mobilních dat T-Mobile přeskočíme měření síly signálu a
            doporučíme umístění jen podle směru k vysílači.
          </span>
        </div>
      )}
    </StepShell>
  );
}
