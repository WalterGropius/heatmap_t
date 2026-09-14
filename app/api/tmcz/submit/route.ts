export const dynamic = "force-dynamic";

/**
 * Stand-in for the preferred on-prem / internal TMCZ API (see chapter 3 of
 * AR_instalace_FWA_routeru_E2E_flow: "Preferovat on-prem / interní TMCZ API
 * za firewallem"). This route only validates shape and keeps submissions in
 * memory for inspection during the demo — swap this for the real internal
 * endpoint once architecture/security has signed off; the request/response
 * shape here is the one agreed for nacenění.
 *
 * POST is called as soon as the recommended place / measurement is
 * evaluated (not after full installation) so the visit is captured even if
 * the customer drops off. PATCH records the customer's later confirm/reject
 * of that recommended place.
 */

interface StoredRecord {
  receivedAt: number;
  payload: unknown;
}

const submissions = new Map<string, StoredRecord>();

function keyFor(sessionId: unknown): string {
  return typeof sessionId === "string" && sessionId ? sessionId : `anon-${Date.now()}`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "payload must be an object" }, { status: 400 });
  }

  const sessionId = (body as Record<string, unknown>).sessionId;
  const key = keyFor(sessionId);
  const receivedAt = Date.now();
  submissions.set(key, { receivedAt, payload: body });

  console.info(`[tmcz-stub] install data received for session=${key}`, body);

  return Response.json({ ok: true, receivedAt, sessionKey: key });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "payload must be an object" }, { status: 400 });
  }

  const { sessionId, confirmedPlace, confirmedAt } = body as Record<string, unknown>;
  const key = keyFor(sessionId);
  const existing = submissions.get(key);
  const merged = {
    ...(existing?.payload as Record<string, unknown> | undefined),
    confirmedPlace,
    confirmedAt,
  };
  submissions.set(key, { receivedAt: Date.now(), payload: merged });

  console.info(`[tmcz-stub] placement confirmation for session=${key}`, { confirmedPlace, confirmedAt });

  return Response.json({ ok: true });
}
