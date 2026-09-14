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
  /** Generic icon key used when the router has no reference photo. */
  icon?: "power" | "sim" | "button" | "led";
}

export interface TourStepConfig {
  key: "power" | "sim" | "button" | "led";
  title: string;
  description: string;
  failureMessage: string;
  highlights: StepHighlight[];
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
    description:
      "Do vyznačeného konektoru (POWER) zapojte napájecí kabel a druhý konec zapojte do elektrické zásuvky.",
    failureMessage: "Zapojte napájecí kabel, namiřte kamerou na router a zkuste to znovu.",
    specialLogic: "requirePowcab",
    highlights: [{ id: "pow", image: "/router-xiaomi/step-power.png" }],
  },
  {
    key: "sim",
    title: "Vložení SIM karty",
    description: "Otevřete SIM slot a vložte SIM kartu.",
    failureMessage: "Otevřete SIM slot a vložte SIM kartu, namiřte kamerou na router a zkuste to znovu.",
    specialLogic: "requireSiminside",
    highlights: [
      { id: "sim", image: "/router-xiaomi/step-sim-open.png" },
      { id: "siminside", image: "/router-xiaomi/step-sim-insert.png" },
    ],
  },
  {
    key: "button",
    title: "Zapnutí routeru",
    description: "Najděte tlačítko pro zapnutí a ujistěte se, že je adaptér v zásuvce.",
    failureMessage: "Namiřte kamerou na zadní stranu routeru a zkuste to znovu.",
    highlights: [{ id: "onbutton", image: "/router-xiaomi/step-button.png" }],
  },
  {
    key: "led",
    title: "Kontrola systémové a 4G/5G LED",
    description:
      "Vyčkejte, až se router zapne a stav kontrolek se ustálí, poté na ně namiřte kamerou.",
    failureMessage:
      "Vyčkejte, až se router zapne a stav kontrolek se ustálí, poté na ně namiřte kamerou a zkuste to znovu.",
    specialLogic: "countOnCheckmark",
    highlights: [{ id: "on", image: "https://placehold.co/64" }],
  },
];

const nokiaSteps: TourStepConfig[] = [
  {
    key: "power",
    title: "Zapojení napájecího kabelu",
    description:
      "Do konektoru POWER na zadní straně routeru zapojte napájecí kabel a druhý konec do elektrické zásuvky.",
    failureMessage: "Zapojte napájecí kabel a potvrďte, že je hotovo.",
    highlights: [{ id: "pow", icon: "power" }],
  },
  {
    key: "sim",
    title: "Vložení SIM karty",
    description: "Otevřete kryt SIM slotu na spodní straně routeru a vložte SIM kartu.",
    failureMessage: "Vložte SIM kartu a potvrďte, že je hotovo.",
    highlights: [{ id: "sim", icon: "sim" }],
  },
  {
    key: "button",
    title: "Zapnutí routeru",
    description: "Stiskněte tlačítko ON/OFF na zadní straně routeru.",
    failureMessage: "Stiskněte tlačítko pro zapnutí a potvrďte, že je hotovo.",
    highlights: [{ id: "onbutton", icon: "button" }],
  },
  {
    key: "led",
    title: "Kontrola stavové LED",
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
