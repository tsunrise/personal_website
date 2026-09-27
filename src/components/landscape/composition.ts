export const WATER_HORIZON = 0.295;
export const EYE_HEIGHT = 1.4;

/** Shared UV coordinates keep moon lighting aligned with both compositions. */
export function moonPosition(width: number, height: number) {
  const portrait = width / height < 0.85;
  return {
    x: portrait ? 0.81 : 0.79,
    y: portrait ? 0.87 : 0.82,
    radius: (Math.min(width, height) / height) * (portrait ? 0.105 : 0.078),
  };
}
