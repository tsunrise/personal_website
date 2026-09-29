import { moonPosition, WATER_HORIZON } from "./composition";
import {
  atmosphericTransmission, linearToSrgb, sampleLighting, srgbToLinear,
} from "./lighting";
import { MOON_DEPTH, Ridge, sceneToScreen, screenToScene } from "./moon";

const center = { x: 0, y: 0 };
const clear = () => 1;
const ridge = (y: number, depth = MOON_DEPTH): Ridge => ({
  points: [{ x: -1, y }, { x: 2, y }], depth,
});

test("spherical atmospheric extinction is bounded and rises smoothly with elevation", () => {
  expect(atmosphericTransmission(Math.PI / 2)).toBeCloseTo(Math.exp(-0.1), 12);
  let previous = 0;
  for (const elevation of [0, 1e-8, 0.001, 0.05, 0.2, 0.5, Math.PI / 2]) {
    const value = atmosphericTransmission(elevation);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeGreaterThanOrEqual(previous);
    expect(value).toBeLessThan(1);
    previous = value;
  }
  expect(atmosphericTransmission(0)).toBeLessThan(0.02);
  expect(atmosphericTransmission(-0.01)).toEqual(atmosphericTransmission(0));
});

test.each([[1440, 900], [390, 844], [800, 320]])(
  "clear reference brightness is independent of composition at %dx%d",
  (width, height) => {
    const reference = sampleLighting(moonPosition(width, height), [], width, height, { x: -0.8, y: 0.5 }, clear);
    expect(reference.incidentIntensity).toBe(1);
    expect(reference.transmission).toBeCloseTo(1, 12);
    expect(reference.directIntensity).toBeCloseTo(1, 12);
    expect(reference.ambientGain).toBeCloseTo(1, 12);
    expect(reference.angularRadius).toBeGreaterThan(0);
  },
);

test("a cloud over only the mountain-hidden disc does not dim the exposed half", () => {
  const moon = { x: 0.5, y: 0.6, radius: 0.08 };
  const mountains = [ridge(moon.y)];
  const half = sampleLighting(moon, mountains, 800, 600, center, clear);
  const hiddenCloud = sampleLighting(moon, mountains, 800, 600, center, ({ y }) => y < moon.y ? 0 : 1);
  const exposedCloud = sampleLighting(moon, mountains, 800, 600, center, ({ y }) => y > moon.y ? 0 : 1);
  expect(half.transmission).toBeCloseTo(0.5, 12);
  expect(hiddenCloud.directIntensity).toBeCloseTo(half.directIntensity, 12);
  expect(exposedCloud.directIntensity).toBe(0);
  expect(half.sourceDirection[1]).toBeGreaterThan(half.direction[1]);
});

test("cloud callbacks use sky depth zero while rays and ridges retain their own parallax", () => {
  const width = 1200, height = 800, parallax = { x: 0.8, y: -0.6 };
  const moon = { x: 0.56, y: 0.65, radius: 0.08 };
  const screen = sceneToScreen(moon, MOON_DEPTH, width, height, parallax);
  const skyMoon = screenToScene(screen, 0, width, height, parallax);
  const ridgeMoon = screenToScene(screen, 4, width, height, parallax);
  const light = sampleLighting(moon, [ridge(ridgeMoon.y, 4)], width, height, parallax,
    ({ y }) => y >= skyMoon.y ? 0.4 : 0);
  expect(light.transmission).toBeCloseTo(0.2, 12);
});

test("uniform cloud transmission dims light without moving the source or changing its spread", () => {
  const moon = { x: 0.75, y: 0.7, radius: 0.1 };
  const full = sampleLighting(moon, [], 1200, 800, center, clear);
  const cloud = sampleLighting(moon, [], 1200, 800, center, () => 0.27);
  expect(cloud.incidentIntensity).toBe(full.incidentIntensity);
  expect(cloud.directIntensity).toBeCloseTo(full.directIntensity * 0.27, 12);
  full.sourceDirection.forEach((component, i) => expect(cloud.sourceDirection[i]).toBeCloseTo(component, 12));
  full.covariance.forEach((component, i) => expect(cloud.covariance[i]).toBeCloseTo(component, 12));
});

test("partial horizontal coverage moves the source centroid and narrows its angular spread", () => {
  const moon = { x: 0.5, y: 0.65, radius: 0.1 };
  const full = sampleLighting(moon, [], 1200, 800, center, clear);
  const right = sampleLighting(moon, [], 1200, 800, center, ({ x }) => x >= moon.x ? 1 : 0);
  expect(right.transmission).toBeCloseTo(0.5, 12);
  expect(right.sourceDirection[0]).toBeGreaterThan(full.sourceDirection[0]);
  expect(right.covariance[0]).toBeLessThan(full.covariance[0]);
  const vectors = [right.sourceDirection, right.tangentX, right.tangentY];
  vectors.forEach((vector) => expect(Math.hypot(...vector)).toBeCloseTo(1, 12));
  expect(vectors[0].reduce((sum, v, i) => sum + v * vectors[1][i], 0)).toBeCloseTo(0, 12);
  expect(vectors[0].reduce((sum, v, i) => sum + v * vectors[2][i], 0)).toBeCloseTo(0, 12);
  expect(vectors[1].reduce((sum, v, i) => sum + v * vectors[2][i], 0)).toBeCloseTo(0, 12);
  expect(right.covariance[0] * right.covariance[2] - right.covariance[1] ** 2).toBeGreaterThanOrEqual(0);
});

test("changing the displayed angular size changes spread without adding light energy", () => {
  const moon = { x: 0.5, y: 0.7, radius: 0.03 };
  const small = sampleLighting(moon, [], 1200, 800, center, clear);
  const big = sampleLighting({ ...moon, radius: 0.12 }, [], 1200, 800, center, clear);
  expect(big.directIntensity).toBeCloseTo(small.directIntensity, 12);
  expect(big.angularRadius).toBeGreaterThan(small.angularRadius * 3.9);
  expect(big.covariance[0]).toBeGreaterThan(small.covariance[0] * 15);
  expect(big.covariance[2]).toBeGreaterThan(small.covariance[2] * 15);
});

test("full mountain occlusion removes direct illumination but retains finite geometry and dusk ambient", () => {
  const moon = { x: 0.7, y: 0.6, radius: 0.08 };
  const light = sampleLighting(moon, [ridge(0.9)], 800, 600, center, clear);
  expect(light.incidentIntensity).toBeGreaterThan(0);
  expect(light.directIntensity).toBe(0);
  expect(light.transmission).toBe(0);
  expect(light.sourceDirection).toEqual(light.direction);
  expect(light.covariance).toEqual([0, 0, 0]);
  expect(light.ambientGain).toBe(0.88);
  for (const vector of [light.direction, light.sourceDirection, light.tangentX, light.tangentY, light.covariance]) {
    vector.forEach((value) => expect(Number.isFinite(value)).toBe(true));
  }
});

test("ambient stays within its gentle range at horizon and high elevations", () => {
  let previous = 0;
  for (const y of [WATER_HORIZON, WATER_HORIZON + 1e-8, 0.35, 0.5, 0.7, 0.9]) {
    const light = sampleLighting({ x: 0.5, y, radius: 0.03 }, [], 1200, 800, center, clear);
    expect(Number.isFinite(light.directIntensity)).toBe(true);
    expect(light.ambientGain).toBeGreaterThanOrEqual(0.88);
    expect(light.ambientGain).toBeLessThanOrEqual(1);
    expect(light.ambientGain).toBeGreaterThanOrEqual(previous);
    previous = light.ambientGain;
  }
});

test("linear-light conversion round-trips dark painted tones and white", () => {
  for (const value of [0, 0.01, 0.04045, 0.15, 0.3, 0.8, 1]) {
    expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 6);
  }
  expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 6);
});
