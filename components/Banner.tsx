import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "error";

const TONE_ICON: Record<Tone, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "alert",
  error: "alert",
};

/** Inline status message. `busy` swaps the icon for a spinner. */
export default function Banner({
  tone = "info",
  icon,
  busy = false,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: IconName;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`banner ${tone} ${className}`} role={tone === "error" ? "alert" : undefined}>
      {busy ? <span className="dot-spin" aria-hidden /> : <Icon name={icon ?? TONE_ICON[tone]} size={20} className="banner-icon" />}
      <span>{children}</span>
    </div>
  );
}
