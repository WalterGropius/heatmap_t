"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepShell from "@/components/StepShell";
import { useSessionStore } from "@/lib/session-store";
import { bearingDegrees, distanceKm, parseLatLng } from "@/lib/geo";
import Banner from "@/components/Banner";

type Status = "idle" | "calibrating" | "started" | "error";

export default function CompassPage() {
  const nav = useRouter();
  const btsCoordinates = useSessionStore((s) => s.btsCoordinates);
  const patch = useSessionStore((s) => s.patch);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [pointingCorrectly, setPointingCorrectly] = useState(false);
  const [compassOpened, setCompassOpened] = useState(false);
  const [rotation, setRotation] = useState(0);

  const targetBearingRef = useRef<number | null>(null);
  const bts = parseLatLng(btsCoordinates) ?? { lat: 50.1365308093, lng: 14.3689261923 };

  // Demo fallback: without an activation link there is no ?bts=, so seed a
  // default BTS location (central Prague) to keep the flow testable.
  useEffect(() => {
    if (!btsCoordinates) patch({ btsCoordinates: "50.1365308093,14.3689261923" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsIOS(typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && /AppleWebKit/.test(navigator.userAgent));
  }, []);

  function handleOrientation(e: DeviceOrientationEvent) {
    if (targetBearingRef.current == null) return;
    const withHeading = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const compass =
      typeof withHeading.webkitCompassHeading === "number"
        ? withHeading.webkitCompassHeading
        : Math.abs((e.alpha ?? 0) - 360);

    const r = targetBearingRef.current - compass;
    setRotation(r);
    const normalized = ((r % 360) + 360) % 360;
    setPointingCorrectly(normalized <= 10 || normalized >= 350);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestIOSPermission(): Promise<boolean> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        return (await DOE.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true;
  }

  function startOrientationTracking() {
    const supportsAbsolute = "ondeviceorientationabsolute" in window;
    if (supportsAbsolute) {
      window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
    } else {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    setStatus("started");
  }

  async function startCompass() {
    if (!bts) {
      setStatus("error");
      setErrorMessage("Nejsou k dispozici souřadnice vysílače (BTS).");
      return;
    }
    if (isIOS) {
      const granted = await requestIOSPermission();
      if (!granted) {
        setStatus("error");
        setErrorMessage("Přístup k orientaci zařízení byl odepřen.");
        return;
      }
    }
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Geolokace není v tomto prohlížeči podporována.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const phone = { lat: position.coords.latitude, lng: position.coords.longitude };
        const azimuth = bearingDegrees(phone, bts);
        const distance = distanceKm(phone, bts);
        targetBearingRef.current = azimuth;
        patch({ phoneLat: phone.lat, phoneLng: phone.lng, azimuthDeg: azimuth, distanceKm: distance });
        startOrientationTracking();
      },
      (err) => {
        setStatus("error");
        setErrorMessage(
          err.code === err.PERMISSION_DENIED
            ? "Přístup k poloze byl odepřen. Povolte prosím službu určování polohy a zkuste to znovu."
            : "Nepodařilo se zjistit vaši polohu. Zkuste to prosím znovu na volném prostranství."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const beginCalibrating = () => {
    setCompassOpened(true);
    setStatus("calibrating");
  };

  const finishCalibrating = () => {
    void startCompass();
  };

  return (
    <StepShell
      step="compass"
      footer={
        <>
          <button className="btn btn-ghost btn-back" onClick={() => nav.back()}>
            Zpět
          </button>
          <button className="btn btn-primary" disabled={!compassOpened} onClick={() => nav.push("/locate")}>
            Pokračovat
          </button>
        </>
      }
    >
      <p className="step-eyebrow">Směr k vysílači</p>
      <h1>Najdeme směr k vysílači</h1>
      <p className="lead">
        Ideální oblast pro router je u okna nebo na parapetu směrem k
        vysílači. V dalším kroku pak přesné místo doladíme podle naměřené
        kvality připojení.
      </p>

      {status === "error" && errorMessage && <Banner tone="error">{errorMessage}</Banner>}

      {status === "calibrating" && (
        <>
          <img src="/calibrate-compass.jpeg" alt="Kalibrace kompasu" className="compass-calibrate" />
          <p className="lead" style={{ textAlign: "center" }}>
            Pohybujte telefonem ve tvaru osmičky, dokud se kompas nezkalibruje.
          </p>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={finishCalibrating}>
              Hotovo
            </button>
          </div>
        </>
      )}

      {status !== "calibrating" && (
        <div className="compass-wrap">
          <div className={`compass-ring ${pointingCorrectly ? "on-target" : ""}`}>
            {status === "started" ? (
              <div className="compass-arrow" style={{ transform: `rotate(${rotation}deg)` }}>
                {pointingCorrectly ? (
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              </div>
            ) : (
              <span className="compass-idle">
                {status === "error" ? "Chyba při spouštění kompasu" : "Kompas zatím neběží"}
              </span>
            )}
          </div>

          {status === "started" && (
            <p style={{ fontWeight: 700, textAlign: "center", maxWidth: 320 }}>
              {pointingCorrectly
                ? "Správný směr! Umístěte router k oknu tímto směrem."
                : "Otáčejte se, dokud šipka nebude směřovat nahoru."}
            </p>
          )}

          {status !== "started" && (
            <button className="btn btn-primary" onClick={status === "error" ? finishCalibrating : beginCalibrating}>
              {status === "error" ? "Zkusit znovu" : "Spustit kompas"}
            </button>
          )}
        </div>
      )}

      <p className="support-note">
        Při prvním použití vás telefon může požádat o přístup k poloze a ke
        kompasu — potvrďte to, prosím.
      </p>
    </StepShell>
  );
}
