import * as tf from "@tensorflow/tfjs";
import type { DetectionResult } from "./types";

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

/** Runs one YOLOv8 graph-model inference over an image/video frame. */
export async function detectWithModel(
  model: tf.GraphModel,
  classNames: string[],
  img: HTMLImageElement | HTMLVideoElement,
  size = 640
): Promise<DetectionResult[]> {
  const [imgHeight, imgWidth] =
    img instanceof HTMLImageElement ? [img.naturalHeight, img.naturalWidth] : [img.videoHeight, img.videoWidth];

  if (!imgHeight || !imgWidth) return [];

  const tensor = tf.tidy(() => {
    const input = tf.browser.fromPixels(img);
    const resized = tf.image.resizeBilinear(input, [size, size]);
    const normalized = resized.div(tf.scalar(255));
    return normalized.expandDims(0);
  });

  try {
    const result = model.execute(tensor) as tf.Tensor;
    const detections = await processPredictions(result, classNames, imgWidth, imgHeight);
    tf.dispose([tensor, result]);
    return detections;
  } catch (error) {
    console.error("YOLO inference failed:", error);
    tf.dispose(tensor);
    return [];
  }
}

async function processPredictions(
  predictions: tf.Tensor,
  classNames: string[],
  imgWidth: number,
  imgHeight: number
): Promise<DetectionResult[]> {
  const preNMS: DetectionResult[] = [];

  const transposed = tf.tidy(() => {
    if (
      predictions.shape.length === 3 &&
      predictions.shape[1] === 4 + classNames.length &&
      predictions.shape[2] === 8400
    ) {
      return predictions.transpose([0, 2, 1]);
    }
    return tf.clone(predictions);
  });

  const [boxes, scores, classIndices] = tf.tidy(() => {
    const numBoxes = transposed.shape[1] || 0;
    const numOutputChannels = transposed.shape[2] || 0;
    const numClasses = numOutputChannels - 4;
    if (numBoxes <= 0 || numOutputChannels <= 4) return [[], [], []];

    const boxes = tf.slice(transposed, [0, 0, 0], [1, numBoxes, 4]);
    const classScores = tf.slice(transposed, [0, 0, 4], [1, numBoxes, numClasses]);
    const maxScores = tf.max(classScores, 2);
    const classIdx = tf.argMax(classScores, 2);

    return [
      boxes.squeeze().arraySync() as number[][],
      maxScores.squeeze().arraySync() as number[],
      classIdx.squeeze().arraySync() as number[],
    ];
  });
  tf.dispose(transposed);

  for (let i = 0; i < boxes.length; i++) {
    const confidence = scores[i];
    const classIndex = classIndices[i];
    if (confidence < CONFIDENCE_THRESHOLD) continue;
    if (classIndex >= classNames.length) continue;

    const [x, y, w, h] = boxes[i];
    const x1 = Math.max(0, ((x - w / 2) * imgWidth) / 640);
    const y1 = Math.max(0, ((y - h / 2) * imgHeight) / 640);
    const width = Math.min((w * imgWidth) / 640, imgWidth - x1);
    const height = Math.min((h * imgHeight) / 640, imgHeight - y1);

    preNMS.push({ bbox: [x1, y1, width, height], class: classNames[classIndex], confidence });
  }

  return applyNMS(preNMS, IOU_THRESHOLD);
}

function applyNMS(detections: DetectionResult[], iouThreshold: number): DetectionResult[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const selected: DetectionResult[] = [];

  for (const detection of sorted) {
    const overlaps = selected.some(
      (kept) => kept.class === detection.class && iou(detection.bbox, kept.bbox) > iouThreshold
    );
    if (!overlaps) selected.push(detection);
  }
  return selected;
}

function iou(a: readonly number[], b: readonly number[]): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const xMin = Math.max(ax, bx);
  const yMin = Math.max(ay, by);
  const xMax = Math.min(ax + aw, bx + bw);
  const yMax = Math.min(ay + ah, by + bh);
  if (xMax < xMin || yMax < yMin) return 0;
  const inter = (xMax - xMin) * (yMax - yMin);
  return inter / (aw * ah + bw * bh - inter);
}
