import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AR instalace FWA routeru — T-Mobile",
  description:
    "AR průvodce instalací FWA routeru: rozpoznání routeru přes YOLOv8 (TensorFlow.js), nalezení nejsilnějšího signálu pomocí WebXR heatmapy a navedené zapojení SIM karty, kabelů a spuštění.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#e20074",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
