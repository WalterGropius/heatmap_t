import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mapa signálu — AR měření pokrytí",
  description:
    "WebXR demo: projděte místnost a živé měření rychlosti stahování vykreslí na podlaze sloupce po 1 m² — výška a barva ukazují nejlepší naměřené připojení v každém místě.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
