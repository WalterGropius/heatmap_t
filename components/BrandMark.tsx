/** The magenta "T" tile used in the app bar and on the landing hero. */
export default function BrandMark({ inverted = false, size = 32 }: { inverted?: boolean; size?: number }) {
  return (
    <span
      className={`brand-mark${inverted ? " inverted" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }}
      aria-hidden
    >
      T
    </span>
  );
}
