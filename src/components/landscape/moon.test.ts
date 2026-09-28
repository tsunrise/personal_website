import { moonPosition, WATER_HORIZON } from "./composition";
import {
  canResetMoon, clampMoon, interpolateMoon, moonLight, mountainCoverage,
  MOON_DEPTH, OVERSCAN, RESET_SECONDS, Ridge, sceneToScreen, screenMoon, screenToScene,
} from "./moon";

test.each([[1440, 900], [390, 844], [800, 320]])("coordinate transforms and disc bounds agree at %dx%d", (width, height) => {
  const parallax = { x: -0.8, y: 0.65 }, uv = { x: 0.17, y: 0.73 };
  for (const depth of [2, 2.5, 3, 4.5, 5]) {
    const roundTrip = screenToScene(sceneToScreen(uv, depth, width, height, parallax), depth, width, height, parallax);
    expect(roundTrip.x).toBeCloseTo(uv.x);
    expect(roundTrip.y).toBeCloseTo(uv.y);
  }
  const horizon = sceneToScreen({ x: 0.5, y: WATER_HORIZON }, 3, width, height, parallax).y;
  for (const x of [-2, 0.5, 3]) for (const y of [-2, 0.5, 3]) {
    const moon = clampMoon({ ...moonPosition(width, height), x, y }, width, height, parallax);
    const disc = screenMoon(moon, width, height, parallax);
    expect(disc.x - disc.radius).toBeGreaterThanOrEqual(-1e-8);
    expect(disc.x + disc.radius).toBeLessThanOrEqual(width + 1e-8);
    expect(disc.y - disc.radius).toBeGreaterThanOrEqual(-1e-8);
    expect(disc.y + disc.radius).toBeLessThanOrEqual(horizon + 1e-8);
  }
});

test("coverage measures the union of ridge silhouettes over disc area, including parallax", () => {
  const width = 800, height = 600, moon = { x: 0.5, y: 0.6, radius: 0.08 };
  const ridge = (y: number, depth = MOON_DEPTH): Ridge => ({ points: [{ x: -1, y }, { x: 2, y }], depth });
  expect(mountainCoverage(moon, [], width, height)).toBe(0);
  expect(mountainCoverage(moon, [ridge(0.4)], width, height)).toBe(0);
  expect(mountainCoverage(moon, [ridge(0.8)], width, height)).toBeCloseTo(1);
  const half = mountainCoverage(moon, [ridge(0.6)], width, height);
  expect(half).toBeCloseTo(0.5, 8);
  expect(mountainCoverage(moon, [ridge(0.6), ridge(0.6), ridge(0.4)], width, height)).toBeCloseTo(half, 8);
  const parallax = { x: 0.7, y: -0.9 }, mountainDepth = 4.5;
  const alignedY = moon.y + parallax.y * (mountainDepth - MOON_DEPTH) / (height * OVERSCAN);
  expect(mountainCoverage(moon, [ridge(alignedY, mountainDepth)], width, height, parallax)).toBeCloseTo(0.5, 8);
});

test("the reset threshold is strictly greater than ninety percent", () => {
  expect(canResetMoon(0.89999)).toBe(false);
  expect(canResetMoon(0.9)).toBe(false);
  expect(canResetMoon(0.90001)).toBe(true);
  expect(canResetMoon(1)).toBe(true);
});

test("the light ray uses the same visible moon projected into the water camera", () => {
  const width = 1200, height = 800, parallax = { x: -0.75, y: 0.5 };
  const moon = { x: 0.23, y: 0.7, radius: 0.06 };
  const light = moonLight(moon, width, height, parallax);
  const waterScreen = sceneToScreen(light.moon, 3, width, height, parallax);
  const visible = screenMoon(moon, width, height, parallax);
  expect(waterScreen.x).toBeCloseTo(visible.x);
  expect(waterScreen.y).toBeCloseTo(visible.y);
  expect(Math.hypot(...light.direction)).toBeCloseTo(1);
  expect(light.direction[0]).toBeLessThan(0);
  expect(light.direction[1]).toBeGreaterThan(0);
  expect(light.direction[2]).toBeGreaterThan(0);
  expect(moonLight({ ...moon, x: 0.77 }, width, height).direction[0]).toBeGreaterThan(0);
});

test("reset interpolation has exact endpoints, a smooth midpoint, and no overshoot", () => {
  const from = { x: 0.2, y: 0.4, radius: 0.05 }, to = { x: 0.8, y: 0.85, radius: 0.05 };
  expect(interpolateMoon(from, to, -1)).toEqual(from);
  expect(interpolateMoon(from, to, 0)).toEqual(from);
  expect(interpolateMoon(from, to, RESET_SECONDS / 2)).toEqual({ x: 0.5, y: 0.625, radius: 0.05 });
  expect(interpolateMoon(from, to, RESET_SECONDS)).toEqual(to);
  expect(interpolateMoon(from, to, 10)).toEqual(to);
  const first = interpolateMoon(from, to, RESET_SECONDS * 0.01).x - from.x;
  const middle = interpolateMoon(from, to, RESET_SECONDS * 0.51).x - 0.5;
  expect(first).toBeLessThan(middle);
});
