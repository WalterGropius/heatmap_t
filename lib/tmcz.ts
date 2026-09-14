import type { CellStats } from "./columns";
import type { InstallSession, PlaceRating } from "./session-store";
import { getRouter } from "./routers";

/**
 * Shape of the data sent to TMCZ, per chapter 4 of the E2E flow spec
 * (AR_instalace_FWA_routeru_E2E_flow). This client posts to /api/tmcz/submit,
 * a stand-in for the preferred on-prem / internal TMCZ API sitting behind the
 * TMCZ firewall — swap the endpoint in submitInstallData() once that API
 * exists; the payload shape here is what was agreed for nacenění and should
 * not need to change.
 */
export interface TmczPayload {
  sessionId: string | null;
  orderId: string | null;
  phoneGps: { lat: number; lng: number } | null;
  btsGps: { lat: number; lng: number } | null;
  distanceKm: number | null;
  azimuthDeg: number | null;
  network: {
    connectionKind: string;
    tmobileConfirmed: boolean | null;
  };
  measurement: {
    fallbackNoMeasurement: boolean;
    bestMbps: number | null;
    cellCount: number | null;
    sampleCount: number | null;
    placeRating: PlaceRating | null;
    recommendedCell: CellStats | null;
    heatmapSamples: CellStats[];
  };
  confirmedPlace: boolean | null;
  measureStartAt: number | null;
  dataSentAt: number;
  device: { userAgent: string; platform: string };
  router: { id: string; name: string };
}

function deviceInfo() {
  if (typeof navigator === "undefined") {
    return { userAgent: "unknown", platform: "unknown" };
  }
  return { userAgent: navigator.userAgent, platform: navigator.platform || "unknown" };
}

/** Caps the heatmap sample set sent over the wire to the most informative cells. */
function topCells(cells: CellStats[], max = 200): CellStats[] {
  return [...cells].sort((a, b) => b.bestMbps - a.bestMbps).slice(0, max);
}

export function buildTmczPayload(session: InstallSession): TmczPayload {
  return {
    sessionId: session.sessionId,
    orderId: session.orderId,
    phoneGps:
      session.phoneLat != null && session.phoneLng != null
        ? { lat: session.phoneLat, lng: session.phoneLng }
        : null,
    btsGps: session.btsCoordinates
      ? (() => {
          const [lat, lng] = session.btsCoordinates!.split(",").map(Number);
          return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        })()
      : null,
    distanceKm: session.distanceKm,
    azimuthDeg: session.azimuthDeg,
    network: {
      connectionKind: session.connectionKind,
      tmobileConfirmed: session.tmobileConfirmed,
    },
    measurement: {
      fallbackNoMeasurement: session.fallbackNoMeasurement,
      bestMbps: session.bestMbps,
      cellCount: session.cellCount,
      sampleCount: session.sampleCount,
      placeRating: session.placeRating,
      recommendedCell: session.recommendedCell,
      heatmapSamples: topCells(session.heatmapSamples),
    },
    confirmedPlace: session.confirmedPlace,
    measureStartAt: session.measureStartAt,
    dataSentAt: Date.now(),
    device: deviceInfo(),
    router: { id: session.routerId, name: getRouter(session.routerId).name },
  };
}

export async function submitInstallData(payload: TmczPayload): Promise<boolean> {
  try {
    const res = await fetch("/api/tmcz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("TMCZ submit failed:", err);
    return false;
  }
}

export async function confirmPlacement(sessionId: string | null, confirmed: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/tmcz/submit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, confirmedPlace: confirmed, confirmedAt: Date.now() }),
    });
    return res.ok;
  } catch (err) {
    console.error("TMCZ confirm-placement patch failed:", err);
    return false;
  }
}
