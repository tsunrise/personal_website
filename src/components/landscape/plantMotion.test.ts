import { EYE_HEIGHT, WATER_HORIZON } from "./composition";
import {
  plantMaskColor,
  PLANT_DEPTH_RANGE,
  PLANT_LENGTH_RANGE,
  reedDepth,
} from "./plantMotion";

test("reed depth reprojects its waterline root through the water camera", () => {
  const farRoot = 0.891;
  const nearRoot = 0.985;
  expect(reedDepth(farRoot)).toBeGreaterThan(reedDepth(nearRoot));
  for (const root of [farRoot, nearRoot]) {
    const projectedRoot = WATER_HORIZON - EYE_HEIGHT / reedDepth(root);
    expect(projectedRoot).toBeCloseTo(1 - root);
  }
});

test("plant metadata retains root pinning and physical dimensions in a linear RGB texture", () => {
  const depth = reedDepth(0.891);
  const distance = 0.105 * depth;
  const decode = (color: string) => color.match(/\d+/g)!.map(Number);
  const root = decode(plantMaskColor(0, depth, 0));
  const tip = decode(plantMaskColor(1, depth, distance));
  expect(root[0]).toBe(0);
  expect(root[2]).toBe(0);
  expect(tip[0]).toBe(255);
  expect(root[1]).toBe(tip[1]);
  expect(Math.abs((tip[1] / 255) * PLANT_DEPTH_RANGE - depth)).toBeLessThan(
    PLANT_DEPTH_RANGE / 510,
  );
  expect(Math.abs((tip[2] / 255) * PLANT_LENGTH_RANGE - distance)).toBeLessThan(
    PLANT_LENGTH_RANGE / 510,
  );
});
