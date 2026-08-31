export type ConnectionKind = "wifi" | "cellular" | "ethernet" | "unknown";

interface NetworkInformationLike extends EventTarget {
  type?: string;
  effectiveType?: string;
}

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/**
 * Best-effort connection classification via the Network Information API.
 * The web platform exposes the *type* of link (wifi/cellular) on some
 * platforms (notably Chrome on Android), but never the carrier — whether
 * cellular data is T-Mobile or O2 is not readable from a browser, which is
 * why the UI asks the user to disable Wi-Fi and check their network first.
 */
export function readConnectionKind(): ConnectionKind {
  const c = getConnection();
  const t = c?.type;
  if (t === "wifi") return "wifi";
  if (t === "cellular") return "cellular";
  if (t === "ethernet") return "ethernet";
  return "unknown";
}

/** Subscribe to connection changes; returns an unsubscribe function. */
export function watchConnection(cb: (kind: ConnectionKind) => void): () => void {
  const c = getConnection();
  cb(readConnectionKind());
  if (!c) return () => {};
  const handler = () => cb(readConnectionKind());
  c.addEventListener("change", handler);
  return () => c.removeEventListener("change", handler);
}
