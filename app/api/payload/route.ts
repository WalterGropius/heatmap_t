export const dynamic = "force-dynamic";

const MIN_BYTES = 16 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_BYTES = 256 * 1024;

/**
 * Serves an incompressible random payload of the requested size.
 * Used by the client as the download target for throughput measurement.
 * Random bytes defeat any transparent compression between server and client,
 * and Cache-Control: no-store defeats CDN/browser caching, so the transfer
 * time reflects the actual link speed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = Number.parseInt(url.searchParams.get("bytes") ?? "", 10);
  const bytes = Math.min(
    MAX_BYTES,
    Math.max(MIN_BYTES, Number.isFinite(requested) ? requested : DEFAULT_BYTES)
  );

  const buf = new Uint8Array(bytes);
  const words = new Uint32Array(buf.buffer, 0, Math.floor(bytes / 4));
  // xorshift32 — fast incompressible noise; cryptographic quality is irrelevant here
  let s = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 || 1;
  for (let i = 0; i < words.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    words[i] = s >>> 0;
  }

  return new Response(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store, no-transform",
    },
  });
}
