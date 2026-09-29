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
  (magenta špendlík „Nejsilnější signál" a šipka na podlaze) — přesná
  souřadnice buňky se dál neuchovává,
  protože počátek WebXR `local-floor` prostoru se mezi seancemi neresetuje
  na nic globálně smysluplného.

## Jak vypadá AR

- **Kamerové kroky** (`/router`, `/install`) běží přes celou obrazovku:
  kamera vyplňuje vše nad instrukční kartou (v landscape je karta vpravo),
  nahoře je průhledná lišta s postupem. Kamera končí u karty, ne pod ní —
  model vidí celý snímek, takže cokoli skrytého pod kartou by byl konektor,
  o kterém zákazník slyší, ale nevidí ho.
- Detekce mají **rámeček** (plynule dohání detekci a krátce drží při výpadku
  snímku), **ilustrace** stojí vedle konektoru a šipkou na něj ukazuje
  (`lib/ar-layout.ts` — velikost podle velikosti detekce, nikdy nepřekrývá
  cíl ani nezajede pod kartu), hotový krok (zapojený kabel, vložená SIM)
  se orámuje zeleně. Konektor mimo výřez displeje dostane šipku k okraji.
- **Heatmapa** (`/locate`) maluje signál na podlahu: každý m² dostane
  zabarvenou dlaždici a 10 cm drátěný sloupec ve škále světle růžová →
  magenta (jako mapa pokrytí T-Mobile; jednobarevná škála je čitelná i pro
  barvoslepé). Nejsilnější místo označí špendlík „Nejsilnější signál",
  k němu vede šipka na podlaze u nohou zákazníka. Karta dole mluví slovy a
  čárkami signálu („Silný signál"), Mbit/s jsou až druhotný údaj.

## Testování AR na fotkách z datasetu

V `tests/fixtures/whitemodem/` jsou testovací a validační fotky z datasetu
WhiteModemFeatures (CC BY 4.0), na kterém byl model natrénován.

```bash
npm test             # rozmístění ilustrací nad všemi označenými díly (bez modelu, ~100 ms)
npm run dev          # v jiném terminálu
npm run ar:preview   # Playwright: skutečný model + UI nad fotkami místo kamery
```

`ar:preview` nahradí `getUserMedia` canvasem, do kterého kreslí fotky z
datasetu, projde celé rozpoznání routeru a zapojení na velikostech telefon,
malý Android, landscape a tablet, a pro každý díl z každé fotky vyfotí
výsledek. U každého snímku změří geometrii (ilustrace mimo obrazovku, přes
cíl, pod kartou) a výsledky uloží do `ar-preview/` (`index.html`,
`report.json`, `sheet-*.png`). `--only gallery|install|router|locate|pages`
a `--viewports phone,landscape,…` výběr zúží, `--strict` vrátí chybu při
nalezeném problému.

### Známé omezení modelu

Model vrací třídu `modem` s ~95% jistotou a rámečkem přes celý snímek pro
**jakýkoli** snímek bez detailů — prázdnou zeď, černý snímek při startu
kamery, i čistý šum (třetina trénovacích štítků `modem` jsou záběry zblízka
přes celou fotku). Rozpoznání routeru proto bere rámeček přes celý snímek
jen tehdy, když je vidět i některý díl routeru (`lib/yolo/evidence.ts`); v
datasetu to platí pro 99 % takových štítků. Trvalé řešení je dotrénovat
model s negativními snímky (prázdné pozadí bez štítků).

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
  ar.ts, sim.ts, columns.ts, speedtest.ts, network.ts, hud.ts   WebXR heatmapa
  ar-layout.ts               geometrie AR překryvu (mapování detekcí, umístění ilustrace)
  yolo/                      YOLOv8 model loader, detekční smyčka, dekódování výstupu,
                             sledování cílů (useTrackedTargets), filtr falešného „modem" (evidence)
  routers.ts                 registr podporovaných FWA routerů + kroky instalace
  session-store.ts           cross-step stav instalační session (zustand, sessionStorage)
  tmcz.ts                    payload a klient pro odeslání dat do TMCZ
  geo.ts, flow.ts             geo výpočty, pořadí kroků průvodce
components/
  StepShell.tsx               sdílená obálka kroku (T-Mobile lišta s postupem, patička)
  ArCamera.tsx                 celoobrazovková kamera: rámečky, LED značky, ilustrace, navigace
  InstallTourLive.tsx          živá kamerová detekce pro krok zapojení
  InstallTourManual.tsx        manuální checklist pro routery bez detektoru
  Icon.tsx, Banner.tsx, BrandMark.tsx   ikony, hlášky a značka T
scripts/ar-preview.mjs        Playwright náhled AR nad fotkami z datasetu
tests/                        test rozmístění ilustrací + fixtures z datasetu
public/model/                 YOLOv8n TensorFlow.js model + metadata
public/router-xiaomi/         fotky a ilustrace kroků pro Xiaomi CB0401v2 5G
public/router-nokia/          ilustrační ikona pro Nokia FastMile 5G Gateway 3.2
```

## TeleNeo font

Rodina **TeleNeo Office** (Regular, Medium, Bold, ExtraBold) je přibalena
v `public/fonts/` jako woff2. TeleNeo je proprietární písmo Deutsche
Telekom — před nasazením mimo kontext T-Mobile ověřte licenci.
