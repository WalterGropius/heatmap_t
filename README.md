# AR instalace FWA routeru

Jeden AR průvodce instalací FWA (Fixed Wireless Access) routeru, postavený
podle interního zadání `AR_instalace_FWA_routeru_E2E_flow` (T-Mobile CZ):
rozpoznání routeru pomocí YOLOv8 (TensorFlow.js), navedení směrem k vysílači
kompasem, nalezení nejsilnějšího signálu pomocí WebXR heatmapy a navedené
zapojení SIM karty, kabelů a spuštění s kontrolou LED.

Tento repozitář vznikl sloučením dvou dřívějších demo projektů:

- **signal-columns** (WebXR AR heatmapa pokrytí, three.js) — dnes krok
  „Najít ideální místo" (`/locate`).
- **yolov8-tfjs-demo** (rozpoznávání komponent modemu přes vlastní YOLOv8n
  model, TensorFlow.js) — dnes kroky rozpoznání routeru (`/router`) a
  navedené zapojení (`/install`).

## Flow (app router stránky)

| Krok | Cesta | Co dělá |
| --- | --- | --- |
| 0 | `/` | Úvod, načtení `?session=&order=&bts=&router=` z aktivačního odkazu |
| 1 | `/consent` | Jedno okno „Povolit vše / Ukončit" (kamera, poloha, kompas, data) |
| 2 | `/router` | Rozpoznání routeru přes kameru (YOLOv8) → tipy → sken štítku → ruční výběr |
| 3 | `/network` | Kontrola typu připojení a operátora (T-Mobile vs. jiný) |
| 4 | `/compass` | Směr a vzdálenost k doporučené BTS (GPS + kompas) |
| 5 | `/locate` | WebXR/simulační heatmapa síly signálu, doporučení místa |
| 6 | `/confirm` | Potvrzení finálního umístění zákazníkem |
| 7 | `/install` | Navedené zapojení SIM/kabelů/tlačítka + kontrola LED (živá detekce nebo manuální checklist) |
| 8 | `/done` | Úspěšné dokončení / troubleshooting a podpora |
| — | `/fallback` | Zjednodušený režim bez měření, pokud zákazník neudělí souhlasy |

Data se odesílají na `/api/tmcz/submit` (POST) hned po vyhodnocení
doporučeného místa a znovu (PATCH) při potvrzení finálního umístění — přesně
podle bodu „odeslat data hned po vyhodnocení, nečekat na konec instalace" ze
zadání. Tato route je **zástupný stub** pro preferovanou on-prem/interní
TMCZ API architekturu; payload (`lib/tmcz.ts`) odpovídá datové tabulce ze
zadání (session/order id, GPS telefonu a BTS, vzdálenost, operátor/síť,
naměřená kvalita, hodnocení místa, doporučené a potvrzené místo, časy
měření/odeslání, zařízení, model routeru, azimut).

## Podporované routery

`lib/routers.ts` drží registr FWA routerů — přidání dalšího modelu je jen
nová položka v poli, beze změny zbytku flow (viz zadání, bod „Podpora
zařízení"):

- **Xiaomi CB0401v2 5G** — aktuálně namapovaný model, má natrénovaný YOLOv8n
  detektor komponent (`public/model/`, třídy `lan/modem/off/on/onbutton/
  orange/pow/powcab/sim/siminside/simopen`) → krok zapojení běží s živou
  detekcí přes kameru.
- **Nokia FastMile 5G Gateway 3.2** — ukázka druhého/nového routeru bez
  natrénovaného detektoru → krok zapojení běží jako manuální, ale stále plně
  navedený checklist.

Rozpoznání modelu na `/router` je 3fázový fallback podle zadání: kamera
(YOLO) → tipy na zlepšení snímání → sken štítku → ruční výběr ze seznamu.

## Zjednodušení oproti produkční verzi

- **Operátor SIM karty** (T-Mobile vs. O2/Vodafone) nejde z prohlížeče
  zjistit — `/network` proto typ sítě detekuje (Wi-Fi/mobilní síť) a
  operátora si nechá potvrdit zákazníkem, přesně jak zadání popisuje jako
  nutný fallback.
- **Měření kvality připojení** používá reálný test rychlosti stahování
  (`/api/payload`, `lib/speedtest.ts`), ne čtení dBm/RSRP — zadání počítá s
  touto variantou jako fallbackem, pokud platforma neumožní čtení
  skutečných signálových hodnot.
- **TMCZ API** je in-memory stub (`/api/tmcz/submit`) — architektura,
  security a přesný rozsah dat čekají na potvrzení dle kapitoly 3 zadání.
- **Doporučené místo** se v `/locate` komunikuje live, přímo ve scéně
  (nejvyšší/magenta sloupec) — přesná souřadnice buňky se dál neuchovává,
  protože počátek WebXR `local-floor` prostoru se mezi seancemi neresetuje
  na nic globálně smysluplného.

## Spuštění

```bash
npm install
npm run dev
```

WebXR (`/locate` → „Spustit AR měření") vyžaduje zabezpečený kontext a
zařízení s ARCore (viz sekce níže) — na desktopu použijte „Simulace v
prohlížeči", která běží se stejným enginem i měřením. Kamerová detekce
(`/router`, `/install`) potřebuje přístup ke kameře a funguje v libovolném
moderním prohlížeči.

### Podpora zařízení pro WebXR krok

| Platforma | AR režim |
| --- | --- |
| Android — Chrome/Edge s [ARCore](https://developers.google.com/ar/devices) | ✅ |
| Meta Quest / Pico / jiné prohlížeče v headsetech (passthrough) | ✅ |
| iOS Safari | ❌ (WebXR AR chybí — použijte simulaci) |
| Desktopové prohlížeče | Použijte **Simulaci v prohlížeči** |

## Nasazení na Vercel

```bash
npm i -g vercel
vercel
```

…nebo repozitář naimportujte na [vercel.com/new](https://vercel.com/new).
Vercel servíruje přes HTTPS (nutné pro WebXR i pro kameru) a všechny
`/api/*` routy běží jako serverless funkce.

## Struktura projektu

```
app/
  page.tsx                 landing + načtení instalačního kontextu
  consent/                 souhlasy
  router/                  rozpoznání routeru (YOLOv8 + fallback chain)
  network/                 kontrola připojení / operátora
  compass/                  směr a vzdálenost k BTS
  locate/                   WebXR/sim heatmapa + doporučení místa
  confirm/                  potvrzení finálního umístění
  install/                  navedené zapojení (živá detekce nebo manuální)
  done/                     dokončení / troubleshooting
  fallback/                 režim bez souhlasů/měření
  api/payload, api/ping     nestlačitelný payload + ping pro speedtest
  api/tmcz/submit           stub pro odeslání dat do TMCZ
lib/
  ar.ts, sim.ts, columns.ts, speedtest.ts, network.ts, hud.ts   WebXR heatmapa (beze změny)
  yolo/                      YOLOv8 model loader, detekční smyčka, dekódování výstupu
  routers.ts                 registr podporovaných FWA routerů + kroky instalace
  session-store.ts           cross-step stav instalační session (zustand, sessionStorage)
  tmcz.ts                    payload a klient pro odeslání dat do TMCZ
  geo.ts, flow.ts             geo výpočty, pořadí kroků průvodce
components/
  StepShell.tsx               sdílená obálka kroku (progress dots, header/footer)
  InstallTourLive.tsx          živá kamerová detekce pro krok zapojení
  InstallTourManual.tsx        manuální checklist pro routery bez detektoru
public/model/                 YOLOv8n TensorFlow.js model + metadata
public/router-xiaomi/         fotky pro Xiaomi CB0401v2 5G
public/router-nokia/          ilustrační ikona pro Nokia FastMile 5G Gateway 3.2
```

## TeleNeo font

Rodina **TeleNeo Office** (Regular, Medium, Bold, ExtraBold) je přibalena
v `public/fonts/` jako woff2. TeleNeo je proprietární písmo Deutsche
Telekom — před nasazením mimo kontext T-Mobile ověřte licenci.
