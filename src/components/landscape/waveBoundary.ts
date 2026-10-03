import { BridgeGeometry } from "./bridgeGeometry";
import { EYE_HEIGHT, WATER_HORIZON } from "./composition";

/** World metres on the river plane: +X screen-right, +Z away from the viewer. */
export type WaterPoint = { x: number; z: number };

export interface WaveBarrier {
  points: WaterPoint[];
  closed?: boolean;
  /** Fraction of incident wave amplitude returned by this edge. */
  reflectance: number;
}

/**
 * RGBA per texel, rows from the viewport bottom (UV y = 0) upward:
 * soft wall normal X/Z into the water (its length is the confidence),
 * distance to the nearest edge in metres, and local reflectance.
 */
export interface WaveBoundaryField {
  width: number;
  height: number;
  data: Float32Array;
}

// Vertical masonry returns almost all incident energy. Sloping earth banks
// dissipate most of it in their shallows, and rounded footing stones lie between.
export const MASONRY_REFLECTANCE = 0.9;
export const STONE_REFLECTANCE = 0.5;
export const BANK_REFLECTANCE = 0.28;
/** The edge influences the spectrum only within this many metres. */
export const BOUNDARY_REACH = 5;
/** Wind regenerates a component over this many wavelengths of open fetch. */
export const LEE_FETCH = 2.5;
/** A finite wall's reflected beam spreads by diffraction within about a wavelength. */
export const REFLECTION_REACH = [0.6, 1.2] as const;
// Equidistant walls blend their normals over this width, so a channel's centre
// line fades both reflections instead of exposing a seam between image waves.
const SOFTNESS = 0.22;
// The shader clamps its ray at the same distance below the horizon.
const MIN_BELOW_HORIZON = 0.018;

/** Matches the water shader's ray/plane intersection for a viewport position. */
export function screenToWater(x: number, y: number, width: number, height: number): WaterPoint {
  const z = EYE_HEIGHT / Math.max(WATER_HORIZON - (1 - y / height), MIN_BELOW_HORIZON);
  return { x: (x / width - 0.5) * (width / height) * z, z };
}

/** The abutments meet the water as vertical rectangles under the arch's springings. */
export function bridgeBarriers(g: BridgeGeometry): WaveBarrier[] {
  const world = (u: number, v: number) => ({
    x: g.cx + (u * g.cosAngle - v * g.sinAngle) * g.modelScale,
    z: g.cz + (u * g.sinAngle + v * g.cosAngle) * g.modelScale,
  });
  return [-1, 1].map((side) => ({
    points: [
      world(side * g.archHalfSpan, -g.halfWidth),
      world(side * g.halfLength, -g.halfWidth),
      world(side * g.halfLength, g.halfWidth),
      world(side * g.archHalfSpan, g.halfWidth),
    ],
    closed: true,
    reflectance: MASONRY_REFLECTANCE,
  }));
}

/** Converts a painted waterline, dropping points closer together than one field texel. */
export function screenBarrier(
  points: readonly { x: number; y: number }[],
  width: number,
  height: number,
  reflectance: number,
  closed = false,
  spacing = width / 160,
): WaveBarrier {
  const kept: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    const last = kept[kept.length - 1];
    if (!last || i === points.length - 1 || Math.hypot(p.x - last.x, p.y - last.y) >= spacing) kept.push(p);
  });
  return {
    points: kept.map((p) => screenToWater(p.x, p.y, width, height)),
    closed,
    reflectance,
  };
}

/**
 * Samples distance, wall normal, and reflectance from the river's edges in
 * world metres. Normals point from the nearest edge point into the water, so
 * convex corners radiate them and scatter the image waves around the corner.
 */
export function createWaveBoundary(
  width: number,
  height: number,
  barriers: readonly WaveBarrier[],
  columns = 160,
): WaveBoundaryField {
  const fieldWidth = Math.max(2, Math.min(columns, Math.round(width)));
  const fieldHeight = Math.max(2, Math.min(256, Math.round((fieldWidth * height) / width)));
  const data = new Float32Array(fieldWidth * fieldHeight * 4);
  const list: number[] = [];
  for (const barrier of barriers) {
    const { points } = barrier;
    const count = barrier.closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(length > 1e-6) || !Number.isFinite(length)) continue;
      list.push(a.x, a.z, b.x - a.x, b.z - a.z, length, barrier.reflectance,
        Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z));
    }
  }
  const stride = 10, cutoff = SOFTNESS * 7, limit = BOUNDARY_REACH + cutoff;
  const segments = Float64Array.from(list), row = new Float64Array(segments.length);
  for (let j = 0; j < fieldHeight; j++) {
    const v = (j + 0.5) / fieldHeight;
    if (v >= WATER_HORIZON) continue;
    // Every texel in a row lies at one depth; keep only edges within reach of it.
    const pz = screenToWater(0, (1 - v) * height, width, height).z;
    let count = 0;
    for (let s = 0; s < segments.length; s += stride) {
      if (segments[s + 8] - pz > limit || pz - segments[s + 9] > limit) continue;
      for (let k = 0; k < stride; k++) row[count + k] = segments[s + k];
      count += stride;
    }
    if (!count) continue;
    for (let column = 0; column < fieldWidth; column++) {
      const px = screenToWater(((column + 0.5) / fieldWidth) * width, (1 - v) * height, width, height).x;
      let nearest = Infinity, weight = 0, nx = 0, nz = 0, reflectance = 0;
      for (let s = 0; s < count; s += stride) {
        const reach = (nearest < BOUNDARY_REACH ? nearest : BOUNDARY_REACH) + cutoff;
        let ex = row[s + 6] - px, ez = row[s + 8] - pz;
        if (ex < 0) ex = px - row[s + 7] > 0 ? px - row[s + 7] : 0;
        if (ez < 0) ez = pz - row[s + 9] > 0 ? pz - row[s + 9] : 0;
        if (ex * ex + ez * ez > reach * reach) continue;
        const ax = row[s], az = row[s + 1], dx = row[s + 2], dz = row[s + 3], length = row[s + 4];
        let t = ((px - ax) * dx + (pz - az) * dz) / (length * length);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ox = px - ax - dx * t, oz = pz - az - dz * t;
        const distance = Math.sqrt(ox * ox + oz * oz);
        if (distance > reach) continue;
        // A running soft minimum: rescale earlier weights when a closer edge appears.
        if (distance < nearest) {
          if (weight > 0) {
            const scale = Math.exp((distance - nearest) / SOFTNESS);
            weight *= scale; nx *= scale; nz *= scale; reflectance *= scale;
          }
          nearest = distance;
        }
        // Length weighting integrates along each edge, independent of its sampling.
        const w = length * Math.exp((nearest - distance) / SOFTNESS);
        weight += w;
        reflectance += w * row[s + 5];
        if (distance > 1e-6) {
          nx += (w * ox) / distance;
          nz += (w * oz) / distance;
        }
      }
      if (!(weight > 0) || nearest >= BOUNDARY_REACH) continue;
      const fade = smoothstep(BOUNDARY_REACH, BOUNDARY_REACH * 0.6, nearest);
      const i = (j * fieldWidth + column) * 4;
      data[i] = (nx / weight) * fade;
      data[i + 1] = (nz / weight) * fade;
      data[i + 2] = nearest;
      data[i + 3] = reflectance / weight;
    }
  }
  return { width: fieldWidth, height: fieldHeight, data };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface BoundaryWave {
  /** Gain on the incident component after lee sheltering. */
  incident: number;
  /** Gain on the image (reflected) component. */
  reflected: number;
  /** Phase of the incident wave at the mirror-image point. */
  reflectedPhase: number;
  /** Reflected unit direction. */
  mirrored: [number, number];
}

/**
 * One spectral component beside a vertical wall, by the method of images.
 * `boundary` is a field texel: [normalX, normalZ, distance, reflectance].
 *
 * Approaching waves (direction·n < 0) add a mirrored copy whose phase is the
 * incident phase at the image point. At the wall this doubles the elevation
 * and cancels the normal slope, the no-flux condition ∂η/∂n = 0 (a standing
 * clapotis). Waves leaving an edge (direction·n > 0) cannot have crossed the
 * land, so they regrow from zero with fetch along their own direction.
 */
export function boundaryWave(
  direction: readonly [number, number],
  k: number,
  phase: number,
  boundary: readonly number[],
): BoundaryWave {
  const confidence = Math.hypot(boundary[0], boundary[1]);
  const nx = boundary[0] / Math.max(confidence, 1e-4), nz = boundary[1] / Math.max(confidence, 1e-4);
  const gap = boundary[2], wavelength = (2 * Math.PI) / k;
  const facing = direction[0] * nx + direction[1] * nz;
  const lee = facing >= 0 ? Math.exp(-gap / Math.max(facing * LEE_FETCH * wavelength, 1e-5)) : 0;
  const approach = smoothstep(0, 0.18, -facing);
  return {
    incident: 1 - confidence * lee,
    reflected: boundary[3] * confidence * approach *
      Math.exp(-gap / (REFLECTION_REACH[0] + REFLECTION_REACH[1] * wavelength)),
    reflectedPhase: phase - 2 * k * gap * facing,
    mirrored: [direction[0] - 2 * facing * nx, direction[1] - 2 * facing * nz],
  };
}

/** GLSL twin of `boundaryWave`; returns incident gain, reflected gain, reflected phase. */
export const waveBoundaryGLSL = `
vec3 boundaryWave(vec2 direction,float k,float phase,vec4 boundary,out vec2 mirrored){
 float confidence=length(boundary.xy);
 vec2 normal=boundary.xy/max(confidence,.0001);
 float gap=boundary.z,wavelength=6.2831853/k;
 float facing=dot(direction,normal);
 float lee=step(0.,facing)*exp(-gap/max(facing*${LEE_FETCH.toFixed(3)}*wavelength,.00001));
 float reflected=boundary.w*confidence*smoothstep(0.,.18,-facing)*
   exp(-gap/(${REFLECTION_REACH[0].toFixed(3)}+${REFLECTION_REACH[1].toFixed(3)}*wavelength));
 mirrored=direction-2.*facing*normal;
 return vec3(1.-confidence*lee,reflected,phase-2.*k*gap*facing);
}`;
