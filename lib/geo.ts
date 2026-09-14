/** Pure geo helpers shared by the compass and location-finding steps. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Parses "lat,lng" (as passed via ?bts=) into a LatLng, or null if malformed. */
export function parseLatLng(raw: string | null | undefined): LatLng | null {
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0].trim());
  const lng = Number.parseFloat(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function formatLatLng(p: LatLng): string {
  return `${p.lat},${p.lng}`;
}

/** Initial bearing (degrees, 0-360, clockwise from true north) from `from` to `to`. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const phi1 = (from.lat * Math.PI) / 180;
  const phi2 = (to.lat * Math.PI) / 180;
  const lambda1 = (from.lng * Math.PI) / 180;
  const lambda2 = (to.lng * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/** Great-circle distance in km between two points (Haversine formula). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return Math.round(R * c * 100) / 100;
}
