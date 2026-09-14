import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CellStats } from "./columns";
import type { ConnectionKind } from "./network";
import { DEFAULT_DETECTABLE_ROUTER_ID } from "./routers";

export type PlaceRating = "nevhodne" | "pouzitelne" | "doporucene";

export interface InstallSession {
  // 3. Installation context (from the activation link / internal API)
  sessionId: string | null;
  orderId: string | null;
  btsCoordinates: string | null; // "lat,lng"

  // 2. Consent
  consentGranted: boolean | null;
  consentDecidedAt: number | null;

  // 4. Router recognition
  routerId: string;

  // 5. Network / operator suitability
  connectionKind: ConnectionKind;
  tmobileConfirmed: boolean | null;
  measurementCapable: boolean | null;

  // 6-8. Location finding
  measureStartAt: number | null;
  phoneLat: number | null;
  phoneLng: number | null;
  azimuthDeg: number | null;
  distanceKm: number | null;
  bestMbps: number | null;
  cellCount: number | null;
  sampleCount: number | null;
  placeRating: PlaceRating | null;
  recommendedCell: CellStats | null;
  heatmapSamples: CellStats[];
  fallbackNoMeasurement: boolean;
  dataSentAt: number | null;

  // 9. Confirmation
  confirmedPlace: boolean | null;
  confirmedAt: number | null;

  // 11. LED check
  ledOk: boolean | null;
}

const EMPTY: InstallSession = {
  sessionId: null,
  orderId: null,
  btsCoordinates: null,
  consentGranted: null,
  consentDecidedAt: null,
  routerId: DEFAULT_DETECTABLE_ROUTER_ID,
  connectionKind: "unknown",
  tmobileConfirmed: null,
  measurementCapable: null,
  measureStartAt: null,
  phoneLat: null,
  phoneLng: null,
  azimuthDeg: null,
  distanceKm: null,
  bestMbps: null,
  cellCount: null,
  sampleCount: null,
  placeRating: null,
  recommendedCell: null,
  heatmapSamples: [],
  fallbackNoMeasurement: false,
  dataSentAt: null,
  confirmedPlace: null,
  confirmedAt: null,
  ledOk: null,
};

interface SessionStore extends InstallSession {
  patch: (partial: Partial<InstallSession>) => void;
  reset: () => void;
}

/**
 * Cross-step install session, persisted to sessionStorage only (not
 * localStorage): the data collected here is GPS/measurement data tied to one
 * physical installation visit and should not linger across browser sessions.
 */
export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      patch: (partial) => set(partial),
      reset: () => set({ ...EMPTY }),
    }),
    {
      name: "fwa-install-session",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : (undefined as never)
      ),
    }
  )
);
