/**
 * Registry of FWA routers the AR installer supports. The E2E flow is
 * identical for every router in this list — only the product image, wiring
 * copy and LED semantics differ (see AR_instalace_FWA_routeru_E2E_flow) — so
 * adding a third model later is just adding another entry here.
 */

export type DetectionClass =
  | "modem"
  | "pow"
  | "powcab"
  | "sim"
  | "siminside"
  | "simopen"
  | "onbutton"
  | "on"
  | "off"
  | "orange"
  | "lan";

export interface StepHighlight {
  /** Detection class this highlight lights up for (ignored in manual mode). */
  id: DetectionClass;
  /** Reference image shown to the user for this highlight, if any. */
  image?: string;
  /** width / height of `image`, so the callout can be laid out before the image loads. */
  aspect?: number;
  /** Generic icon key used when the router has no reference photo. */
  icon?: "power" | "sim" | "button" | "led";
}

export interface TourStepConfig {
  key: "power" | "sim" | "button" | "led";
  title: string;
  /** Two-word label for the tour progress bar. */
  shortTitle: string;
  description: string;
  /** What to point the camera at, shown while nothing relevant is detected. */
  aimHint: string;
  failureMessage: string;
  highlights: StepHighlight[];
  /** Class that shows the step is done (plugged cable, inserted SIM) — framed green when seen. */
  doneClass?: DetectionClass;
  /** Detection logic driving the "next" button in live-detection mode. */
  specialLogic?: "requirePowcab" | "requireSiminside" | "countOnCheckmark";
}

export interface RouterModel {
  id: string;
  name: string;
  subtitle: string;
  /** Product photo used on the recognition/select/start screens. */
  image: string;
  /** Photo of the unboxed router + SIM used on the prep screen. */
  unboxImage: string;
  /**
   * Whether a trained YOLOv8 detector exists for this exact model. The one
   * shipped model was trained on the currently-mapped router's connectors —
   * a router without a trained detector falls back to a manual, still fully
   * guided, checklist tour instead of live camera detection.
   */
  hasDetectionModel: boolean;
  steps: TourStepConfig[];
  led: {
    okCopy: string;
    offCopy: string;
    weakSignalCopy: string;
  };
}

const xiaomiSteps: TourStepConfig[] = [
  {
    key: "power",
    title: "Zapojení napájecího kabelu",
    shortTitle: "Napájení",
    description:
      "Do vyznačeného konektoru (POWER) zapojte napájecí kabel a druhý konec zapojte do elektrické zásuvky.",
    aimHint: "Namiřte kameru na zadní stranu routeru s konektory",
    failureMessage: "Zapojte napájecí kabel, namiřte kamerou na router a zkuste to znovu.",
    specialLogic: "requirePowcab",
    doneClass: "powcab",
    highlights: [{ id: "pow", image: "/router-xiaomi/step-power.png", aspect: 166 / 74 }],
  },
  {
    key: "sim",
    title: "Vložení SIM karty",
    shortTitle: "SIM karta",
    description: "Otevřete SIM slot a vložte SIM kartu.",
    aimHint: "Namiřte kameru na slot SIM karty",
    failureMessage: "Otevřete SIM slot a vložte SIM kartu, namiřte kamerou na router a zkuste to znovu.",
    specialLogic: "requireSiminside",
    doneClass: "siminside",
    highlights: [
      { id: "sim", image: "/router-xiaomi/step-sim-open.png", aspect: 592 / 370 },
      { id: "simopen", image: "/router-xiaomi/step-sim-insert.png", aspect: 270 / 144 },
      { id: "siminside", image: "/router-xiaomi/step-sim-insert.png", aspect: 270 / 144 },
    ],
  },
  {
    key: "button",
    title: "Zapnutí routeru",
    shortTitle: "Zapnutí",
    description: "Najděte tlačítko pro zapnutí a ujistěte se, že je adaptér v zásuvce.",
    aimHint: "Namiřte kameru na tlačítko napájení",
    failureMessage: "Namiřte kamerou na zadní stranu routeru a zkuste to znovu.",
    highlights: [{ id: "onbutton", image: "/router-xiaomi/step-button.svg", aspect: 200 / 90 }],
  },
  {
    key: "led",
    title: "Kontrola systémové a 4G/5G LED",
    shortTitle: "Kontrolky",
    description:
      "Vyčkejte, až se router zapne a stav kontrolek se ustálí, poté na ně namiřte kamerou.",
    aimHint: "Namiřte kameru na kontrolky na přední straně routeru",
    failureMessage:
      "Vyčkejte, až se router zapne a stav kontrolek se ustálí, poté na ně namiřte kamerou a zkuste to znovu.",
    specialLogic: "countOnCheckmark",
    highlights: [{ id: "on", image: "/router-xiaomi/step-led.svg", aspect: 220 / 140 }],
  },
];

const nokiaSteps: TourStepConfig[] = [
  {
    key: "power",
    title: "Zapojení napájecího kabelu",
    shortTitle: "Napájení",
    aimHint: "Najděte konektor POWER na zadní straně routeru",
    description:
      "Do konektoru POWER na zadní straně routeru zapojte napájecí kabel a druhý konec do elektrické zásuvky.",
    failureMessage: "Zapojte napájecí kabel a potvrďte, že je hotovo.",
    highlights: [{ id: "pow", icon: "power" }],
  },
  {
    key: "sim",
    title: "Vložení SIM karty",
    shortTitle: "SIM karta",
    aimHint: "Najděte kryt SIM slotu na spodní straně routeru",
    description: "Otevřete kryt SIM slotu na spodní straně routeru a vložte SIM kartu.",
    failureMessage: "Vložte SIM kartu a potvrďte, že je hotovo.",
    highlights: [{ id: "sim", icon: "sim" }],
  },
  {
    key: "button",
    title: "Zapnutí routeru",
    shortTitle: "Zapnutí",
    aimHint: "Najděte tlačítko ON/OFF na zadní straně routeru",
    description: "Stiskněte tlačítko ON/OFF na zadní straně routeru.",
    failureMessage: "Stiskněte tlačítko pro zapnutí a potvrďte, že je hotovo.",
    highlights: [{ id: "onbutton", icon: "button" }],
  },
  {
    key: "led",
    title: "Kontrola stavové LED",
    shortTitle: "Kontrolky",
    aimHint: "Podívejte se na stavovou LED na přední straně routeru",
    description:
      "Vyčkejte, až se router zapne a stavová LED přestane blikat, poté potvrďte její barvu.",
    failureMessage: "Vyčkejte na ustálení LED a poté potvrďte její stav.",
    highlights: [{ id: "on", icon: "led" }],
  },
];

export const ROUTERS: RouterModel[] = [
  {
    id: "xiaomi-cb0401v2",
    name: "Xiaomi CB0401v2 5G",
    subtitle: "Aktuálně mapovaný router",
    image: "/router-xiaomi/router.png",
    unboxImage: "/router-xiaomi/unbox.png",
    hasDetectionModel: true,
    steps: xiaomiSteps,
    led: {
      okCopy: "Router je zapojený a připojený k síti — vítejte v síti T-Mobile.",
      offCopy:
        "4G/5G LED nesvítí. Zkuste router restartovat a zkontrolovat zapojení SIM karty a kabelů.",
      weakSignalCopy:
        "Signál je slabší. Nemusí jít o chybu — v některých bytech je toto nejlepší dostupný stav. Zkuste prosím doporučené místo z předchozího kroku.",
    },
  },
  {
    id: "nokia-fastmile-3",
    name: "Nokia FastMile 5G Gateway 3.2",
    subtitle: "Nový router (připravovaná podpora)",
    image: "/router-nokia/router.svg",
    unboxImage: "/router-nokia/router.svg",
    hasDetectionModel: false,
    steps: nokiaSteps,
    led: {
      okCopy: "Router je zapojený a připojený k síti — vítejte v síti T-Mobile.",
      offCopy:
        "Stavová LED nesvítí zeleně. Zkuste router restartovat a zkontrolovat zapojení SIM karty a kabelů.",
      weakSignalCopy:
        "Signál je slabší. Nemusí jít o chybu — v některých bytech je toto nejlepší dostupný stav. Zkuste prosím doporučené místo z předchozího kroku.",
    },
  },
];

export function getRouter(id: string | null | undefined): RouterModel {
  return ROUTERS.find((r) => r.id === id) ?? ROUTERS[0];
}

/** The router whose components the shipped YOLOv8 model was actually trained on. */
export const DEFAULT_DETECTABLE_ROUTER_ID = "xiaomi-cb0401v2";
