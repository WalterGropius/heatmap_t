# Signal Columns — AR network heatmap

Walk a room in augmented reality while the app measures your **real download
speed** and turns the floor into a heatmap: every **1 m × 1 m** cell you cross
grows a column whose **height (up to 2 m)** and **color (red → green)**
represent the best connection measured in that spot. Cover a whole room and
you get a physical-looking map of where your signal is strong and where it
dies.

Built with **Next.js (App Router)** + **three.js** on the
[WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API),
designed to deploy on **Vercel**.

## How it works

### World tracking

The AR session requests the WebXR
[`local-floor` reference space](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html):
a world-anchored, six-degrees-of-freedom coordinate system whose origin sits on
the real floor at the point where the session starts. Columns are placed in
that space, so they stay glued to the room while you walk. No markers, no
image targets — tracking comes from the device's SLAM (ARCore on Android,
the headset runtime on VR/AR headsets).

The HUD is drawn with the WebXR `dom-overlay` feature, so the live stats float
over the camera view.

### Speed testing

- `GET /api/payload?bytes=N` — a Next.js server function that streams `N`
  bytes of **incompressible random data** with `Cache-Control: no-store`, so
  neither compression nor any CDN/browser cache can fake the measurement.
- The client (`lib/speedtest.ts`) fetches payloads in a continuous loop and
  times the body transfer via a streaming reader. Time-to-first-byte is
  reported as latency; the body transfer time gives throughput in Mbit/s.
- Payload size **adapts** (32 KB – 4 MB) so each probe takes ≈ 0.7 s on any
  link — long enough to be meaningful, short enough to map to one spot on the
  floor.
- Each finished probe is attributed to where your head actually was
  **mid-transfer** (a small position ring buffer, `lib/hud.ts`).

### The columns

`lib/columns.ts` keeps one cell per square meter (`floor(x)`, `floor(z)` in
floor space) and remembers the **best** Mbit/s ever measured inside it.
Heights and colors are normalized against the **session-wide best**:

- fastest cell of the session → **2 m tall, green**
- everything else scales linearly down to red

so the map stays meaningful whether your Wi-Fi peaks at 20 or 900 Mbit/s.
Columns animate smoothly toward their target height and re-normalize whenever
a new session best is found.

## Running it

```bash
npm install
npm run dev
```

WebXR requires a **secure context**. `http://localhost` counts as secure, but
your phone can't reach your dev machine as "localhost" — for on-device AR
testing either:

- deploy to Vercel (easiest — see below), or
- tunnel the dev server (`npx untun tunnel http://localhost:3000`, ngrok, …), or
- use `adb reverse tcp:3000 tcp:3000` with an Android phone over USB, then
  open `http://localhost:3000` in Chrome on the phone.

### Device support

| Platform | AR mode |
| --- | --- |
| Android — Chrome/Edge with [ARCore](https://developers.google.com/ar/devices) | ✅ |
| Meta Quest / Pico / other headset browsers (passthrough) | ✅ |
| iOS Safari | ❌ (no WebXR AR — use the desktop simulation) |
| Desktop browsers | Use **Desktop simulation** |

**Desktop simulation** runs the identical engine and identical real speed
probes; a virtual walker wanders a 16 m × 16 m room, and because a desktop
link doesn't vary across your desk, throughput is modulated by a smooth
synthetic coverage field so you can see the heatmap behave.

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

…or just import the repo at [vercel.com/new](https://vercel.com/new) — zero
configuration needed. Vercel serves over HTTPS (required for WebXR) and runs
`/api/payload` + `/api/ping` as serverless functions.

> Note: measured throughput is the speed between your device and the nearest
> Vercel edge/function region — which is exactly what you want for comparing
> *relative* signal quality across a room.

## Project layout

```
app/
  page.tsx            landing page + HUD overlay + mode switching
  layout.tsx          metadata / viewport
  globals.css         all styling (landing + HUD)
  api/payload/route.ts  incompressible random payload (speed test target)
  api/ping/route.ts     tiny response for latency
lib/
  ar.ts               immersive-ar session (local-floor tracking, dom-overlay)
  sim.ts              desktop preview with a wandering virtual probe
  columns.ts          the 1 m² column field: grid, normalization, colors
  speedtest.ts        adaptive continuous download probe
  hud.ts              HUD state type + position ring buffer
```

## References

- [WebXR spatial tracking explainer](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html)
- [immersiveweb.dev](https://immersiveweb.dev/)
- [MDN — WebXR spatial tracking](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Spatial_tracking)
