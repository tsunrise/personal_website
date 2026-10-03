import { createBridgeGeometry } from "./bridgeGeometry";
import { WATER_HORIZON } from "./composition";
import {
  boundaryWave, bridgeBarriers, createWaveBoundary, MASONRY_REFLECTANCE,
  screenBarrier, screenToWater, waveBoundaryGLSL, WaveBarrier, WaveBoundaryField,
} from "./waveBoundary";

const W = 1600, H = 900;

function texels(field: WaveBoundaryField) {
  const out: { x: number; z: number; normal: [number, number]; gap: number; reflectance: number }[] = [];
  for (let row = 0; row < field.height; row++) {
    for (let column = 0; column < field.width; column++) {
      const i = (row * field.width + column) * 4;
      const v = (row + 0.5) / field.height;
      if (v >= WATER_HORIZON || Math.hypot(field.data[i], field.data[i + 1]) === 0) continue;
      const p = screenToWater(((column + 0.5) / field.width) * W, (1 - v) * H, W, H);
      out.push({ ...p, normal: [field.data[i], field.data[i + 1]], gap: field.data[i + 2], reflectance: field.data[i + 3] });
    }
  }
  return out;
}
const wall = (x: number, reflectance = 1): WaveBarrier => ({
  points: [{ x, z: 1 }, { x, z: 80 }], reflectance,
});

test("screen waterlines share the bridge's water-plane camera", () => {
  const g = createBridgeGeometry(W, H);
  for (const [u, v] of [[-g.halfLength, -g.halfWidth], [g.archHalfSpan, g.halfWidth], [0, 0]]) {
    const p = g.project(u, 0, v);
    const world = screenToWater(p.x, p.y, W, H);
    expect(world.x).toBeCloseTo(g.cx + (u * g.cosAngle - v * g.sinAngle) * g.modelScale, 6);
    expect(world.z).toBeCloseTo(g.cz + (u * g.sinAngle + v * g.cosAngle) * g.modelScale, 6);
  }
  const [left, right] = bridgeBarriers(g);
  expect(left.reflectance).toBe(MASONRY_REFLECTANCE);
  // Inner abutment faces lie at the arch springings, one arch span apart.
  const span = Math.hypot(right.points[0].x - left.points[0].x, right.points[0].z - left.points[0].z);
  expect(span).toBeCloseTo(2 * g.archHalfSpan * g.modelScale, 6);
});

test("a straight wall gives exact distance and a normal pointing into the water", () => {
  const field = createWaveBoundary(W, H, [wall(0.5)]);
  const samples = texels(field).filter(({ z }) => z > 3 && z < 60);
  expect(samples.length).toBeGreaterThan(200);
  for (const s of samples) {
    expect(s.gap).toBeCloseTo(Math.abs(s.x - 0.5), 4);
    expect(Math.sign(s.normal[0])).toBe(Math.sign(s.x - 0.5));
    expect(Math.abs(s.normal[1])).toBeLessThan(1e-6);
    // Full confidence near the wall, fading to zero at the reach limit.
    if (s.gap < 2.5) expect(Math.abs(s.normal[0])).toBeCloseTo(1, 6);
    expect(s.gap).toBeLessThan(5);
  }
});

test("equidistant walls cancel their normals instead of leaving a seam", () => {
  const field = createWaveBoundary(W, H, [wall(-1.2, 0.9), wall(1.2, 0.3)]);
  const samples = texels(field).filter(({ z, x }) => z > 3 && z < 30 && Math.abs(x) < 1.2);
  const centre = samples.filter(({ x }) => Math.abs(x) < 0.04);
  const sides = samples.filter(({ x }) => Math.abs(x) > 0.8);
  expect(centre.length).toBeGreaterThan(5);
  centre.forEach(({ normal, reflectance }) => {
    expect(Math.hypot(...normal)).toBeLessThan(0.2);
    expect(reflectance).toBeGreaterThan(0.5);
    expect(reflectance).toBeLessThan(0.7);
  });
  sides.forEach(({ x, normal, reflectance }) => {
    expect(Math.hypot(...normal)).toBeGreaterThan(0.95);
    expect(reflectance).toBeCloseTo(x < 0 ? 0.9 : 0.3, 1);
  });
});

test("convex corners radiate normals, scattering image waves around the corner", () => {
  const corner: WaveBarrier = { points: [{ x: -4, z: 8 }, { x: 0, z: 8 }, { x: 0, z: 40 }], reflectance: 1 };
  const field = createWaveBoundary(W, H, [corner]);
  const beyond = texels(field).filter(({ x, z }) => x > 0.6 && z < 7.4 && Math.hypot(x, z - 8) < 2.5);
  expect(beyond.length).toBeGreaterThan(5);
  beyond.forEach(({ x, z, normal, gap }) => {
    const radial = [x / Math.hypot(x, z - 8), (z - 8) / Math.hypot(x, z - 8)];
    expect(gap).toBeCloseTo(Math.hypot(x, z - 8), 3);
    expect(normal[0] * radial[0] + normal[1] * radial[1]).toBeGreaterThan(0.95);
  });
});

test("painted waterlines keep the endpoints and drop sub-texel points", () => {
  const points = Array.from({ length: 200 }, (_, i) => ({ x: 400 + i, y: 800 }));
  const barrier = screenBarrier(points, W, H, 0.3);
  expect(barrier.points.length).toBeLessThan(40);
  expect(barrier.points[0]).toEqual(screenToWater(400, 800, W, H));
  expect(barrier.points[barrier.points.length - 1]).toEqual(screenToWater(599, 800, W, H));
});

describe("a component beside a vertical wall", () => {
  const normal = [1, 0];
  const wallTexel = (gap: number, reflectance = 1) => [normal[0], normal[1], gap, reflectance];
  const k = (2 * Math.PI) / 0.5;
  const unit = (angle: number) => [Math.cos(angle), Math.sin(angle)] as [number, number];
  const slope = (direction: [number, number], phase: number, gap: number) => {
    const wave = boundaryWave(direction, k, phase, wallTexel(gap));
    return [0, 1].map((i) => direction[i] * wave.incident * Math.cos(phase) +
      wave.mirrored[i] * wave.reflected * Math.cos(wave.reflectedPhase));
  };

  test("approaching crests reflect with zero normal slope at the wall", () => {
    for (const angle of [Math.PI, Math.PI * 0.85, Math.PI * 1.2, Math.PI * 0.62]) {
      const direction = unit(angle);
      const wave = boundaryWave(direction, k, 0.7, wallTexel(0));
      expect(wave.incident).toBe(1);
      expect(wave.reflected).toBeCloseTo(1, 6);
      // Mirror law: tangential component kept, normal component reversed.
      expect(wave.mirrored[0]).toBeCloseTo(-direction[0], 9);
      expect(wave.mirrored[1]).toBeCloseTo(direction[1], 9);
      for (const phase of [0, 0.4, 1.9, 3]) {
        const s = slope(direction, phase, 0);
        expect(s[0] * normal[0] + s[1] * normal[1]).toBeCloseTo(0, 9);
      }
    }
  });

  test("the image wave keeps the incident phase at the mirrored point", () => {
    const direction = unit(Math.PI * 0.9), gap = 0.31, phase = 1.3;
    const wave = boundaryWave(direction, k, phase, wallTexel(gap));
    // The incident phase at x - 2·gap·n, written relative to the phase at x.
    expect(wave.reflectedPhase).toBeCloseTo(phase - 2 * k * gap * direction[0], 9);
    // Diffraction weakens the reflected beam with distance from a finite wall.
    expect(wave.reflected).toBeLessThan(boundaryWave(direction, k, phase, wallTexel(0.1)).reflected);
  });

  test("waves leaving an edge regrow with fetch in its lee", () => {
    const direction = unit(0.3);
    const gains = [0, 0.05, 0.2, 0.6, 2, 6].map((gap) => boundaryWave(direction, k, 0, wallTexel(gap)));
    expect(gains[0].incident).toBe(0);
    gains.slice(1).forEach((gain, i) => expect(gain.incident).toBeGreaterThan(gains[i].incident));
    expect(gains[gains.length - 1].incident).toBeGreaterThan(0.99);
    gains.forEach(({ reflected }) => expect(reflected).toBe(0));
    // Longer waves need a longer fetch to recover.
    const long = boundaryWave(direction, k / 4, 0, wallTexel(0.2));
    expect(long.incident).toBeLessThan(gains[2].incident);
  });

  test("gains vary continuously through grazing incidence", () => {
    const at = (angle: number) => boundaryWave(unit(angle), k, 0, wallTexel(0.4));
    const before = at(Math.PI / 2 + 1e-4), after = at(Math.PI / 2 - 1e-4);
    expect(Math.abs(before.incident - after.incident)).toBeLessThan(1e-3);
    expect(Math.abs(before.reflected - after.reflected)).toBeLessThan(1e-3);
  });

  test("open water away from every edge is unchanged", () => {
    const wave = boundaryWave(unit(2.1), k, 0.5, [0, 0, 0, 0]);
    expect(wave.incident).toBe(1);
    expect(wave.reflected).toBe(0);
  });

  test("reflectance scales the returned amplitude", () => {
    const direction = unit(Math.PI);
    expect(boundaryWave(direction, k, 0, wallTexel(0, 0.28)).reflected).toBeCloseTo(0.28, 6);
  });
});

test("the shader evaluates the same edge law", () => {
  expect(waveBoundaryGLSL).toContain("vec3 boundaryWave(vec2 direction,float k,float phase,vec4 boundary,out vec2 mirrored)");
  expect(waveBoundaryGLSL).toContain("phase-2.*k*gap*facing");
  expect(waveBoundaryGLSL).toContain("2.500*wavelength");
});
