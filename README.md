# Mapa signálu — AR heatmapa pokrytí

Projděte místnost v rozšířené realitě, zatímco aplikace měří **skutečnou
rychlost stahování**, a proměňte podlahu v heatmapu: na každé buňce
**1 m × 1 m**, kterou projdete, vyroste sloupec o půdorysu 10 × 10 cm, jehož
**výška (až 2 m)** a **barva (červená → zelená)** odpovídají nejlepšímu
připojení naměřenému v daném místě. **Tři nejrychlejší buňky svítí magentou
(#E20074).** Po projití celé místnosti získáte prostorovou mapu toho, kde je
signál silný a kde umírá.

Postaveno na **Next.js (App Router)** + **three.js** nad
[WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API),
připraveno k nasazení na **Vercel**. Kompletně v češtině, ve vizuálu
T-Mobile (magenta, písmo TeleNeo).

## Jak to funguje

### Sledování prostoru

AR relace používá WebXR
[referenční prostor `local-floor`](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html):
souřadný systém ukotvený ke světu se šesti stupni volnosti, jehož počátek
leží na skutečné podlaze v místě startu relace. Sloupce se umisťují v tomto
prostoru, takže při chůzi zůstávají „přilepené" k místnosti — bez markerů,
jen díky SLAM trackingu zařízení (ARCore na Androidu, runtime headsetu na
brýlích). Na podlaze se navíc vykresluje **bílá mřížka po 1 m** zarovnaná
s buňkami heatmapy, aby bylo mapování v AR čitelné.

HUD se vykresluje přes WebXR funkci `dom-overlay`, takže živé statistiky
plavou nad obrazem kamery.

### Měření rychlosti

- `GET /api/payload?bytes=N` — serverová funkce Next.js streamující `N`
  bajtů **nestlačitelných náhodných dat** s hlavičkou
  `Cache-Control: no-store`, takže měření nezkreslí komprese ani CDN/cache
  prohlížeče.
- Klient (`lib/speedtest.ts`) stahuje payloady v nepřetržité smyčce a měří
  přenos těla odpovědi streamovacím readerem. Doba do prvního bajtu se
  reportuje jako odezva; z doby přenosu těla se počítá propustnost v Mbit/s.
- Velikost payloadu se **adaptuje** (32 KB – 4 MB), aby jedno měření trvalo
  ≈ 0,7 s na jakékoli lince — dost dlouho na smysluplný výsledek, dost
  krátce na přiřazení k jednomu místu na podlaze.
- Každé dokončené měření se přiřadí k místu, kde uživatel skutečně byl
  **uprostřed přenosu** (kruhový buffer poloh, `lib/hud.ts`).

### Zdroj připojení

HUD zobrazuje typ připojení přes Network Information API: **červeně Wi-Fi**,
**magentou mobilní síť**. Prohlížeč ale nedokáže zjistit operátora (jestli
jsou mobilní data T-Mobile, nebo O2) — proto se před startem zobrazí dialog
s výzvou vypnout Wi-Fi a zkontrolovat, že je zařízení v síti T-Mobile.

### Sloupce

`lib/columns.ts` vede jednu buňku na čtvereční metr (`floor(x)`, `floor(z)`
v prostoru podlahy) a pamatuje si **nejlepší** Mbit/s kdy naměřené uvnitř.
Výšky a barvy se normalizují vůči **maximu celé relace**:

- nejrychlejší buňka relace → **2 m vysoká**
- vše ostatní se škáluje lineárně dolů k červené
- **3 nejrychlejší buňky** dostanou místo gradientu **magentu T-Mobile**

takže mapa dává smysl, ať vaše síť vrcholí na 20, nebo 900 Mbit/s. Sloupce
mají poloprůhlednou výplň s **bílým drátěným modelem (wireframe)** navrch,
plynule animují ke své cílové výšce a přenormalizují se, kdykoli padne nové
maximum relace.

## Spuštění

```bash
npm install
npm run dev
```

WebXR vyžaduje **zabezpečený kontext**. `http://localhost` se počítá jako
zabezpečený, ale telefon se k vývojovému stroji jako „localhost" nedostane —
pro testování AR na zařízení buď:

- nasaďte na Vercel (nejjednodušší — viz níže), nebo
- tunelujte dev server (`npx untun tunnel http://localhost:3000`, ngrok, …), nebo
- použijte `adb reverse tcp:3000 tcp:3000` s telefonem Android přes USB a
  otevřete `http://localhost:3000` v Chromu na telefonu.

### Podpora zařízení

| Platforma | AR režim |
| --- | --- |
| Android — Chrome/Edge s [ARCore](https://developers.google.com/ar/devices) | ✅ |
| Meta Quest / Pico / jiné prohlížeče v headsetech (passthrough) | ✅ |
| iOS Safari | ❌ (WebXR AR chybí — použijte simulaci) |
| Desktopové prohlížeče | Použijte **Simulaci v prohlížeči** |

**Simulace v prohlížeči** používá identický engine i identická skutečná
měření; virtuální sonda prochází místnost 16 m × 16 m, a protože se rychlost
desktopové linky v prostoru nemění, moduluje se propustnost hladkým
syntetickým polem pokrytí, aby bylo chování heatmapy vidět.

## Písmo TeleNeo

TeleNeo je proprietární písmo Deutsche Telekom a z licenčních důvodů není
v repozitáři. Vložte soubory `TeleNeo-Regular.woff2`, `TeleNeo-Bold.woff2`
a `TeleNeo-ExtraBold.woff2` do `public/fonts/` — deklarace `@font-face`
v `app/globals.css` je načtou automaticky. Bez nich se použije systémové
bezpatkové písmo.

## Nasazení na Vercel

```bash
npm i -g vercel
vercel
```

…nebo repozitář naimportujte na [vercel.com/new](https://vercel.com/new) —
bez jakékoli konfigurace. Vercel servíruje přes HTTPS (nutné pro WebXR) a
`/api/payload` + `/api/ping` běží jako serverless funkce.

> Poznámka: měřená propustnost je rychlost mezi vaším zařízením a nejbližším
> Vercel regionem — což je přesně to, co chcete pro porovnání *relativní*
> kvality signálu napříč místností.

## Struktura projektu

```
app/
  page.tsx            úvodní stránka + HUD + dialog před startem
  layout.tsx          metadata / viewport (cs)
  globals.css         veškeré styly (landing + HUD + modal, TeleNeo)
  api/payload/route.ts  nestlačitelný náhodný payload (cíl měření)
  api/ping/route.ts     miniaturní odpověď pro odezvu
lib/
  ar.ts               immersive-ar relace (local-floor, dom-overlay, bílá mřížka)
  sim.ts              desktopová simulace s bloudící virtuální sondou
  columns.ts          pole sloupců 10 × 10 cm: mřížka, normalizace, barvy, top-3 magenta
  speedtest.ts        adaptivní nepřetržité měření stahování
  network.ts          typ připojení (Wi-Fi / mobilní síť) přes Network Information API
  hud.ts              typ stavu HUD + kruhový buffer poloh
```

## Odkazy

- [WebXR spatial tracking explainer](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html)
- [immersiveweb.dev](https://immersiveweb.dev/)
- [MDN — WebXR spatial tracking](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Spatial_tracking)
