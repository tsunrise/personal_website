import { EYE_HEIGHT, WATER_HORIZON } from "./composition";

// Linear data in the existing wind texture; no extra texture or per-frame work.
export const PLANT_DEPTH_RANGE = 16;
export const PLANT_LENGTH_RANGE = 3;

/** Camera depth in metres at a reed's root (Canvas Y increases downward). */
export function reedDepth(rootY: number) {
  return EYE_HEIGHT / Math.max(rootY - (1 - WATER_HORIZON), 0.1);
}

/** R: flexibility, G: camera depth, B: vertical distance from the attachment. */
export function plantMaskColor(
  flexibility: number,
  depth: number,
  attachmentDistance: number,
) {
  const byte = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${byte(flexibility)},${byte(depth / PLANT_DEPTH_RANGE)},${byte(attachmentDistance / PLANT_LENGTH_RANGE)})`;
}
