import { WATER_HORIZON } from "./composition";
import { flatWaterReflection, waterSpecular, WaterLightSource } from "./waterLighting";

const normalized = (v: number[]) => {
  const length = Math.hypot(...v);
  return v.map((value) => value / length);
};
const overhead: WaterLightSource = {
  direction: [0, 1, 0], tangentX: [1, 0, 0], tangentY: [0, 0, 1], covariance: [0, 0, 0],
};

test("flat-water reflection follows the same camera ray and can leave the viewport", () => {
  for (const aspect of [390 / 844, 1440 / 900]) {
    const moon = { x: 0.73, y: 0.78 };
    const direction = normalized([(moon.x - 0.5) * aspect, moon.y - WATER_HORIZON, 1]);
    const reflection = flatWaterReflection(direction, aspect)!;
    expect(reflection.x).toBeCloseTo(moon.x);
    expect(reflection.y).toBeCloseTo(2 * WATER_HORIZON - moon.y);
    expect(reflection.y).toBeLessThan(0);
  }
  expect(flatWaterReflection([0, 1, -1], 1)).toBeNull();
});

test("the reflection peak follows the source and exchanges sides symmetrically", () => {
  const source = (x: number): WaterLightSource => ({
    ...overhead, direction: normalized([x, 0.5, 1]),
  });
  const right = source(0.4), left = source(-0.4);
  const rightMirror = [-right.direction[0], right.direction[1], -right.direction[2]];
  const leftMirror = [-left.direction[0], left.direction[1], -left.direction[2]];
  const peak = waterSpecular(rightMirror, [0, 1, 0], right, [1, 0], 1);
  expect(peak).toBeGreaterThan(0);
  expect(waterSpecular(leftMirror, [0, 1, 0], left, [1, 0], 1)).toBeCloseTo(peak);
  expect(waterSpecular(leftMirror, [0, 1, 0], right, [1, 0], 1)).toBeLessThan(peak * 0.001);
});

test("larger source covariance broadens the lobe without adding reflected flux", () => {
  const broad = { ...overhead, covariance: [0.0025, 0, 0.0025] };
  const peak = (source: WaterLightSource) => waterSpecular([0, 1, 0], [0, 1, 0], source, [1, 0], 1);
  expect(peak(broad)).toBeLessThan(peak(overhead));
  const offAxis = normalized([0.3, 1, 0]);
  expect(waterSpecular(offAxis, [0, 1, 0], broad, [1, 0], 1)).toBeGreaterThan(
    waterSpecular(offAxis, [0, 1, 0], overhead, [1, 0], 1),
  );
  // Integrate outgoing power using projected solid angle: N·V dω = dx dz.
  const reflectedFlux = (source: WaterLightSource) => {
    let sum = 0;
    const step = 0.015;
    for (let x = -0.75 + step / 2; x < 0.75; x += step) {
      for (let z = -0.75 + step / 2; z < 0.75; z += step) {
        if (x * x + z * z >= 0.95) continue;
        const view = [x, Math.sqrt(1 - x * x - z * z), z];
        sum += waterSpecular(view, [0, 1, 0], source, [1, 0], 1) * step * step;
      }
    }
    return sum;
  };
  expect(reflectedFlux(broad) / reflectedFlux(overhead)).toBeCloseTo(1, 2);
});

test("source rotation and wind rotation rotate the anisotropic response together", () => {
  const source = { ...overhead, covariance: [0.001, 0.0004, 0.003] };
  const view = normalized([0.2, 1, -0.13]);
  const rotatedSource = {
    ...source, tangentX: [0, 0, 1], tangentY: [-1, 0, 0],
  };
  expect(waterSpecular([-view[2], view[1], view[0]], [0, 1, 0], rotatedSource, [0, 1], 1))
    .toBeCloseTo(waterSpecular(view, [0, 1, 0], source, [1, 0], 1), 10);
});

test("grazing views, calm wind and sloped normals stay finite; backfaces receive no light", () => {
  const source = { ...overhead, direction: normalized([0.2, 0.00001, 1]), covariance: [0.003, 0.002, 0.003] };
  for (const normal of [[0, 1, 0], normalized([0.1, 1, 0.08]), [1, 0, 0]]) {
    for (const elevation of [0, 1e-7, 1e-5, 0.001, 0.1]) {
      const response = waterSpecular(normalized([-0.2, elevation, -1]), normal, source, [0, 0], 0);
      expect(Number.isFinite(response)).toBe(true);
      expect(response).toBeGreaterThanOrEqual(0);
    }
  }
  expect(waterSpecular([0, -1, 0], [0, 1, 0], overhead, [0, 0], 0)).toBe(0);
  expect(waterSpecular([0, 1, 0], [0, -1, 0], overhead, [0, 0], 0)).toBe(0);
});

test("a nearly line-shaped exposed source stays finite and continuous at the horizon", () => {
  for (const elevation of [0.00001, 0.0001, 0.001, 0.01]) {
    const direction = normalized([0, elevation, 1]);
    const variance = elevation * elevation * 0.01;
    const source = {
      direction, tangentX: [1, 0, 0], tangentY: [0, direction[2], -direction[1]],
      covariance: [variance, variance * (1 - 1e-12), variance],
    };
    for (const x of [-0.1, -0.01, 0, 0.01, 0.1]) {
      const view = normalized([x, elevation, -1]);
      const response = waterSpecular(view, [0, 1, 0], source, [1, 1], 0);
      const adjacent = waterSpecular(normalized([x + 1e-9, elevation, -1]), [0, 1, 0], source, [1, 1], 0);
      expect(Number.isFinite(response)).toBe(true);
      expect(response).toBeGreaterThanOrEqual(0);
      expect(Math.abs(adjacent - response)).toBeLessThan(0.001);
    }
  }
});
