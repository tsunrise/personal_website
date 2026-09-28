import {
  bridgeNormal,
  BridgeVertex,
  createBridgeGeometry,
  projectBridgeShadowPolygon,
} from "./bridgeGeometry";
import { EYE_HEIGHT, WATER_HORIZON } from "./composition";

test("the circular arch meets both springings and retains a uniform radial ring", () => {
  const bridge = createBridgeGeometry(1440, 900);
  const left = bridge.archPoint(0);
  const right = bridge.archPoint(1);
  expect(left.u).toBeCloseTo(-bridge.archHalfSpan);
  expect(right.u).toBeCloseTo(bridge.archHalfSpan);
  expect(left.y).toBeCloseTo(bridge.springHeight);
  expect(right.y).toBeCloseTo(bridge.springHeight);
  expect(bridge.archPoint(0.5).y).toBeCloseTo(
    bridge.springHeight + bridge.archRise,
  );

  for (let i = 0; i <= 100; i++) {
    const inner = bridge.archPoint(i / 100);
    const outer = bridge.archPoint(i / 100, bridge.ringThickness);
    const opposite = bridge.archPoint(1 - i / 100);
    expect(inner.u).toBeCloseTo(-opposite.u);
    expect(inner.y).toBeCloseTo(opposite.y);
    expect(Math.hypot(outer.u - inner.u, outer.y - inner.y)).toBeCloseTo(
      bridge.ringThickness,
    );
    // A continuous masonry web remains above the full barrel, not just its crown.
    expect(bridge.deckHeight(outer.u) - outer.y).toBeGreaterThanOrEqual(0.13);
    expect(Math.abs(outer.u)).toBeLessThan(bridge.halfLength);
  }
  expect(bridge.deckHeight(0)).toBe(bridge.crownHeight);
  expect(bridge.deckHeight(-bridge.halfLength)).toBeCloseTo(bridge.endHeight);
  expect(bridge.deckHeight(bridge.halfLength)).toBeCloseTo(bridge.endHeight);
});

test.each([
  [1440, 900, 489.6, 0.78],
  [390, 844, 295.4, 0.92],
])(
  "composition fits the span without distorting the structure at %i by %i",
  (w, h, span, center) => {
    const bridge = createBridgeGeometry(w, h);
    const left = bridge.project(-bridge.halfLength, 0);
    const right = bridge.project(bridge.halfLength, 0);
    expect(right.x - left.x).toBeCloseTo(span);
    expect(bridge.project(0, 0).x).toBeCloseTo(w * center);
    expect(right.y).toBeLessThan(left.y);
    expect(right.y).toBeGreaterThan(h * (1 - WATER_HORIZON));

    const larger = createBridgeGeometry(w * 2, h * 2);
    const sample = bridge.project(1.3, 1.7, -bridge.halfWidth);
    const scaledSample = larger.project(1.3, 1.7, -bridge.halfWidth);
    expect(scaledSample.x).toBeCloseTo(sample.x * 2);
    expect(scaledSample.y).toBeCloseTo(sample.y * 2);
    expect(larger.cz).toBeCloseTo(bridge.cz);
  },
);

test("garden scale changes masonry dimensions while retaining the river's eye height", () => {
  const height = 900;
  const bridge = createBridgeGeometry(1440, height);
  const water = bridge.project(0, 0);
  const crown = bridge.project(0, bridge.crownHeight);
  expect(water.y / height - (1 - WATER_HORIZON)).toBeCloseTo(
    EYE_HEIGHT / bridge.cz,
  );
  expect((water.y - crown.y) / height).toBeCloseTo(
    (bridge.crownHeight * bridge.modelScale) / bridge.cz,
  );
  expect(water.y - crown.y).toBeCloseTo(bridge.crownHeight * bridge.scale);
  expect(bridge.halfLength * 2 * bridge.modelScale).toBeCloseTo(4.745);
});

test("reflections meet water and mirror height at each point's own depth", () => {
  const bridge = createBridgeGeometry(1440, 900);
  for (const u of [-bridge.halfLength, 0, bridge.halfLength]) {
    for (const v of [-bridge.halfWidth, bridge.halfWidth]) {
      const ground = bridge.project(u, 0, v);
      expect(bridge.project(u, 0, v, true)).toEqual(ground);
      const solid = bridge.project(u, bridge.deckHeight(u), v);
      const reflection = bridge.project(u, bridge.deckHeight(u), v, true);
      expect(reflection.x).toBe(solid.x);
      expect((reflection.y + solid.y) / 2).toBeCloseTo(ground.y);
      expect(reflection.y).toBeGreaterThan(ground.y);
    }
  }
});

test("very wide views preserve positive camera depth instead of stretching masonry", () => {
  const bridge = createBridgeGeometry(2560, 1080);
  expect(bridge.cz).toBe(6.4);
  const left = bridge.project(-bridge.halfLength, 0, -bridge.halfWidth);
  const right = bridge.project(bridge.halfLength, 0, bridge.halfWidth);
  expect(Number.isFinite(left.x + left.y + right.x + right.y)).toBe(true);
  expect(left.x).toBeLessThan(right.x);
  expect(bridge.archPoint(0.5).y).toBeCloseTo(1.4);
});

test("bridge normals preserve the world camera orientation and change which riser faces light", () => {
  const bridge = createBridgeGeometry(1440, 900);
  const right = bridgeNormal(bridge, 1, 0, 0);
  const left = bridgeNormal(bridge, -1, 0, 0);
  const near = bridgeNormal(bridge, 0, 0, -1);
  const up = bridgeNormal(bridge, 0, 1, 0);
  expect(up).toEqual([0, 1, 0]);
  expect(near[2]).toBeLessThan(0);
  expect(right[0]).toBeGreaterThan(0);
  for (const n of [right, left, near, up, bridgeNormal(bridge, 0.6, 1, 0)]) {
    expect(Math.hypot(...n)).toBeCloseTo(1);
  }
  const dot = (normal: readonly number[], light: readonly number[]) =>
    normal.reduce((sum, component, i) => sum + component * light[i], 0);
  expect(dot(right, [0.65, 0.4, 1])).toBeGreaterThan(0);
  expect(dot(left, [0.65, 0.4, 1])).toBeLessThan(0);
  expect(dot(right, [-0.65, 0.4, 1])).toBeLessThan(0);
  expect(dot(left, [-0.65, 0.4, 1])).toBeGreaterThan(0);
});

const shadowWall: BridgeVertex[] = [
  [-2, 0, 0], [2, 0, 0], [2, 2, 0], [-2, 2, 0],
];

test("cast shadows travel opposite horizontal moon movement", () => {
  const g = createBridgeGeometry(1440, 900);
  const left = projectBridgeShadowPolygon(g, shadowWall, [-0.5, 0.5, 1], 1440, 900);
  const right = projectBridgeShadowPolygon(g, shadowWall, [0.5, 0.5, 1], 1440, 900);
  const meanX = (points: { x: number }[]) =>
    points.reduce((sum, point) => sum + point.x, 0) / points.length;
  expect(meanX(right)).toBeLessThan(meanX(left));
  // Direction is a ray: its magnitude cannot change the cast silhouette.
  const scaled = projectBridgeShadowPolygon(g, shadowWall, [1, 1, 2], 1440, 900);
  expect(scaled).toEqual(right);
});

test.each([[1440, 900], [390, 844], [320, 800]])(
  "near-horizon shadow polygons stay finite and inside %i by %i viewport",
  (width, height) => {
    const g = createBridgeGeometry(width, height);
    for (const elevation of [0.6, 0.03, 0.001, 0.00001]) {
      for (const x of [-1, 0, 1]) {
        const points = projectBridgeShadowPolygon(
          g, shadowWall, [x, elevation, 1], width, height,
        );
        expect(points.length).toBeGreaterThanOrEqual(3);
        for (const point of points) {
          expect(Number.isFinite(point.x + point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(width);
          expect(point.y).toBeGreaterThan(height * (1 - WATER_HORIZON));
          expect(point.y).toBeLessThanOrEqual(height);
        }
      }
    }
    // Nothing behind the camera is allowed to mirror back onto the river.
    const airborne: BridgeVertex[] = [[-1, 2, 0], [1, 2, 0], [1, 3, 0], [-1, 3, 0]];
    expect(projectBridgeShadowPolygon(g, airborne, [0, 0.001, 1], width, height)).toEqual([]);
    for (const light of [[0, 0, 1], [0, -0.1, 1], [NaN, 1, 1]]) {
      expect(projectBridgeShadowPolygon(g, shadowWall, light, width, height)).toEqual([]);
    }
  },
);
