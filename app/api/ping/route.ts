export const dynamic = "force-dynamic";

/** Tiny response used for round-trip latency measurement. */
export async function GET() {
  return new Response("pong", {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
