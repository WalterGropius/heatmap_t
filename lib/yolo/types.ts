import type * as tf from "@tensorflow/tfjs";

export interface DetectionResult {
  /** [x, y, width, height] in the source image's pixel space. */
  bbox: [number, number, number, number];
  class: string;
  confidence: number;
}

export interface YoloModel {
  model: tf.GraphModel;
  classNames: string[];
  detect: (img: HTMLImageElement | HTMLVideoElement, size?: number) => Promise<DetectionResult[]>;
}
