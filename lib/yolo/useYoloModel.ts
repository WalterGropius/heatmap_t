"use client";

import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import yaml from "js-yaml";
import { detectWithModel } from "./decode";
import type { YoloModel } from "./types";

const MODEL_URL = "/model/model.json";
const METADATA_URL = "/model/metadata.yaml";

interface State {
  model: YoloModel | null;
  progress: number;
  status: string;
  error: string | null;
}

/** Loads the shared YOLOv8n TensorFlow.js graph model once per page. */
export function useYoloModel() {
  const [state, setState] = useState<State>({
    model: null,
    progress: 0,
    status: "Inicializace TensorFlow.js…",
    error: null,
  });
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    let cancelled = false;

    (async () => {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        if (cancelled) return;
        setState((s) => ({ ...s, status: "Zapínám WebGL akceleraci…", progress: 5 }));

        const metadataRes = await fetch(METADATA_URL);
        if (!metadataRes.ok) throw new Error(`Nepodařilo se načíst metadata modelu (${metadataRes.status})`);
        const metadataDoc = yaml.load(await metadataRes.text()) as { names?: Record<string, string> };
        const classNames = metadataDoc?.names ? Object.values(metadataDoc.names) : [];
        if (cancelled) return;
        setState((s) => ({ ...s, status: "Načítám model rozpoznávání…", progress: 15 }));

        const model = await tf.loadGraphModel(MODEL_URL, {
          onProgress: (fraction) => {
            if (!cancelled) setState((s) => ({ ...s, progress: 15 + Math.round(fraction * 70) }));
          },
        });
        if (cancelled) return;
        setState((s) => ({ ...s, status: "Zahřívám model…", progress: 90 }));

        const dummy = tf.zeros([1, 640, 640, 3]);
        const warmup = model.execute(dummy) as tf.Tensor | tf.Tensor[];
        if (Array.isArray(warmup)) warmup.forEach((t) => t.dispose());
        else warmup.dispose();
        dummy.dispose();
        if (cancelled) return;

        const yoloModel: YoloModel = {
          model,
          classNames,
          detect: (img, size = 640) => detectWithModel(model, classNames, img, size),
        };
        setState({ model: yoloModel, progress: 100, status: "Model načten.", error: null });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Nepodařilo se načíst model rozpoznávání.",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
