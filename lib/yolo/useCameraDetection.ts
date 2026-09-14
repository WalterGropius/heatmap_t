"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectionResult, YoloModel } from "./types";

export type DetectionMode = "continuous" | "snapshot";

interface Options {
  model: YoloModel | null;
  mode?: DetectionMode;
  onLowPerformance?: () => void;
  lowPerformanceThreshold?: { dps: number; duration: number };
}

const DETECTIONS_UPDATE_INTERVAL = 100;
/** Minimum gap between inference calls. YOLO decoding does a blocking
 *  GPU→CPU tensor readback, so running it on every animation frame can
 *  saturate the main thread (especially on software-rendered WebGL) —
 *  a few inferences per second is plenty for this guided-tour UX. */
const MIN_INFERENCE_INTERVAL_MS = 200;

/** Manages the environment-facing webcam feed and the YOLO detection loop over it. */
export function useCameraDetection({
  model,
  mode = "continuous",
  onLowPerformance,
  lowPerformanceThreshold = { dps: 4, duration: 3000 },
}: Options) {
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isDetectingRef = useRef(false);
  const requestRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectionUpdateRef = useRef(0);
  const dpsCounterRef = useRef<number[]>([]);
  const lowPerfRef = useRef({ firstLowTime: 0, triggered: false });

  const clearDetections = useCallback(() => setDetections([]), []);

  const runSingleDetection = useCallback(async (): Promise<DetectionResult[]> => {
    if (!model || !videoRef.current || videoRef.current.readyState < 3) return [];
    const found = await model.detect(videoRef.current);
    setDetections(found);
    return found;
  }, [model]);

  const detectLoop = useCallback(async () => {
    if (!model || !videoRef.current || !isDetectingRef.current) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
      return;
    }

    const video = videoRef.current;
    if (video.paused || video.ended || !video.videoWidth || video.readyState < 3) {
      if (isDetectingRef.current) requestRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const sinceLastInference = performance.now() - lastDetectionUpdateRef.current;
    if (sinceLastInference < MIN_INFERENCE_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    try {
      const found = await model.detect(video);
      const now = performance.now();

      dpsCounterRef.current.push(now);
      while (dpsCounterRef.current.length > 0 && dpsCounterRef.current[0] < now - 1000) {
        dpsCounterRef.current.shift();
      }

      if (onLowPerformance && !lowPerfRef.current.triggered) {
        const currentDps = dpsCounterRef.current.length;
        if (currentDps > 0 && currentDps < lowPerformanceThreshold.dps) {
          if (lowPerfRef.current.firstLowTime === 0) lowPerfRef.current.firstLowTime = now;
          else if (now - lowPerfRef.current.firstLowTime > lowPerformanceThreshold.duration) {
            onLowPerformance();
            lowPerfRef.current.triggered = true;
          }
        } else {
          lowPerfRef.current.firstLowTime = 0;
        }
      }

      if (now - lastDetectionUpdateRef.current > DETECTIONS_UPDATE_INTERVAL) {
        setDetections(found);
        lastDetectionUpdateRef.current = now;
      }
    } catch (error) {
      console.error("Detection loop error:", error);
    }

    if (isDetectingRef.current) requestRef.current = requestAnimationFrame(detectLoop);
  }, [model, onLowPerformance, lowPerformanceThreshold.dps, lowPerformanceThreshold.duration]);

  const stopCamera = useCallback(() => {
    setIsDetecting(false);
    isDetectingRef.current = false;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setDetections([]);
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || isDetectingRef.current) return;
    setCameraError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      streamRef.current = stream;
      dpsCounterRef.current = [];
      lowPerfRef.current = { firstLowTime: 0, triggered: false };
      setDetections([]);
      setIsDetecting(true);
      isDetectingRef.current = true;

      if (mode === "continuous") requestRef.current = requestAnimationFrame(detectLoop);
    } catch (error) {
      setIsDetecting(false);
      isDetectingRef.current = false;
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") setCameraError("Přístup ke kameře byl odepřen.");
        else if (error.name === "NotFoundError") setCameraError("Na zařízení nebyla nalezena kamera.");
        else if (error.name === "NotReadableError") setCameraError("Kameru právě používá jiná aplikace.");
        else setCameraError(`${error.name}: ${error.message}`);
      } else {
        setCameraError("Nepodařilo se spustit kameru.");
      }
    }
  }, [detectLoop, mode]);

  useEffect(() => stopCamera, [stopCamera]);

  return {
    videoRef,
    detections,
    isDetecting,
    cameraError,
    startCamera,
    stopCamera,
    runSingleDetection,
    clearDetections,
  };
}
