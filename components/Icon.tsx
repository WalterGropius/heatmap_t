/**
 * Line icons in the T-Mobile style: 24 px grid, 2 px round strokes,
 * currentColor — so they take the magenta/ink of whatever they sit in.
 * Replaces the emoji the flow used to use, which rendered differently on
 * every platform and never matched the brand.
 */

const PATHS = {
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2h5.8l1.6 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  signal: <path d="M5 20v-3M10 20v-6M15 20v-10M20 20V5" />,
  data: <path d="M8 20V5M4.5 8.5 8 5l3.5 3.5M16 4v15M12.5 15.5 16 19l3.5-3.5" />,
  check: <path d="M20 6 9 17l-5-5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />,
  plug: <path d="M9 2.5v4.5M15 2.5v4.5M6 7h12v4a6 6 0 0 1-12 0zM12 17v4.5" />,
  sim: (
    <>
      <path d="M7 2.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V4a1.5 1.5 0 0 1 1-1.5z" />
      <rect x="9" y="11" width="6" height="7" rx="1" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v8" />
      <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
    </>
  ),
  led: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  router: (
    <>
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 16.5h.01M10.5 16.5h.01M17 13V7" />
      <path d="M14 5a4.2 4.2 0 0 1 6 0" />
    </>
  ),
  wifi: <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01" />,
  navigate: <path d="M3 11 21 3l-8 18-2-8z" />,
  scan: <path d="M3 7.5V5a2 2 0 0 1 2-2h2.5M16.5 3H19a2 2 0 0 1 2 2v2.5M21 16.5V19a2 2 0 0 1-2 2h-2.5M7.5 21H5a2 2 0 0 1-2-2v-2.5M7 12h10" />,
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  refresh: <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V8H16" />,
  support: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  shield: <path d="M12 3 4.5 6v5.5c0 4.7 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.8 7.5-9.5V6z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m9 21 2.5-6.5L14 17v4M8 11l3-3.5 3.5 1L17 12M11.5 14.5 13 9" />
    </>
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  size = 24,
  className,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Four-bar signal meter — the one signal-strength metaphor every phone owner already reads. */
export function SignalBars({ level, size = 28 }: { level: 0 | 1 | 2 | 3 | 4; size?: number }) {
  return (
    <svg className="signal-bars" width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false">
      {[0, 1, 2, 3].map((i) => {
        const h = 7 + i * 6;
        return (
          <rect
            key={i}
            x={2 + i * 6.5}
            y={26 - h}
            width={4.5}
            height={h}
            rx={1.5}
            className={i < level ? "on" : "off"}
          />
        );
      })}
    </svg>
  );
}
