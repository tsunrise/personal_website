/** A small, immutable optical-depth atlas shared by the CPU and GPU. */
export interface CloudAtlas { size: number; data: Uint8Array }
type Point = { x: number; y: number };
type Color = readonly [number, number, number];

const SIZE = 512;
let atlas: CloudAtlas | undefined;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (n: number, period: number) => ((n % period) + period) % period;

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

/**
 * Smoothed value noise on a periodic lattice, tabulated for every atlas texel:
 * hashes once per lattice cell and smoothed fractions once per row and column.
 * Integer periods make the broad shapes and wisps seamless together.
 */
function noiseTable(columns: number, rows: number, seed: number) {
  const lattice = new Float64Array(columns * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) lattice[y * columns + x] = hash(x, y, seed);
  }
  const axis = (period: number) => {
    const cell = new Int32Array(SIZE), next = new Int32Array(SIZE), weight = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const p = ((i + 0.5) / SIZE) * period, index = Math.floor(p);
      cell[i] = wrap(index, period);
      next[i] = wrap(index + 1, period);
      weight[i] = smooth(0, 1, p - index);
    }
    return { cell, next, weight };
  };
  const xs = axis(columns), ys = axis(rows), out = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = ys.cell[y] * columns, below = ys.next[y] * columns, ty = ys.weight[y];
    for (let x = 0; x < SIZE; x++) {
      const left = xs.cell[x], right = xs.next[x], tx = xs.weight[x];
      out[y * SIZE + x] = mix(
        mix(lattice[row + left], lattice[row + right], tx),
        mix(lattice[below + left], lattice[below + right], tx),
        ty,
      );
    }
  }
  return out;
}

export function getCloudAtlas(): CloudAtlas {
  if (atlas) return atlas;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const broad12 = noiseTable(12, 12, 731), broad24 = noiseTable(24, 24, 1297), broad48 = noiseTable(48, 48, 1879);
  const near8 = noiseTable(8, 32, 2777), near24 = noiseTable(24, 64, 3089);
  const far8 = noiseTable(8, 32, 3911), far24 = noiseTable(24, 64, 4721);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const broad = broad12[i] * 0.58 + broad24[i] * 0.27 + broad48[i] * 0.15;
    const nearWisps = near8[i] * 0.7 + near24[i] * 0.3;
    const farWisps = far8[i] * 0.7 + far24[i] * 0.3;
    const near = Math.pow(smooth(0.49, 0.75, broad * 0.7 + nearWisps * 0.3), 1.3);
    const far = Math.pow(smooth(0.49, 0.75, broad * 0.7 + farWisps * 0.3), 1.3);
    // R/G each encode optical depth / 2; B is reserved, A is not opacity.
    data[i * 4] = Math.round(near * 255);
    data[i * 4 + 1] = Math.round(far * 255);
    data[i * 4 + 3] = 255;
  }
  atlas = { size: SIZE, data };
  return atlas;
}

/** Match RepeatWrapping + LinearFilter with flipY=false, including texel centers. */
function sampleAtlas(u: number, v: number, channel: number) {
  const { size, data } = getCloudAtlas();
  const x = (u - Math.floor(u)) * size - 0.5;
  const y = (v - Math.floor(v)) * size - 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
  const sample = (dx: number, dy: number) =>
    data[(wrap(iy + dy, size) * size + wrap(ix + dx, size)) * 4 + channel] / 255;
  return mix(mix(sample(0, 0), sample(1, 0), tx), mix(sample(0, 1), sample(1, 1), tx), ty);
}

function layerDepth(uv: Point, aspect: number, air: Point, far: boolean) {
  // A tile spans four viewport heights; the two layers share the same air mass.
  // Keep the initial moon in a clear opening in both responsive compositions.
  const x = (uv.x * aspect - air.x * 0.0015) * 0.25 + (far ? 0.52 : 0.495);
  const y = (uv.y - air.y * 0.0003) * 0.25 + (far ? 0.1225 : 0.14);
  const horizonFade = smooth(0.15, 0.5, uv.y);
  return sampleAtlas(x, y, far ? 1 : 0) * 2 * horizonFade;
}

/** UV is the sky artwork's +Y-up space, before overscan and layer parallax. */
export function cloudOpticalDepth(uv: Point, aspect: number, air: Point): readonly [number, number] {
  return [layerDepth(uv, aspect, air, false), layerDepth(uv, aspect, air, true)];
}

export function cloudTransmission(uv: Point, aspect: number, air: Point) {
  const depths = cloudOpticalDepth(uv, aspect, air);
  return Math.exp(-depths[0] - depths[1]);
}

const linear = (value: number) => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
const NEAR_CORE = [0.40, 0.50, 0.64].map(linear);
const FAR_CORE = [0.48, 0.57, 0.68].map(linear);
const CLOUD_PEARL = [0.83, 0.85, 0.85].map(linear);
const MOON_COLOR = [0.91, 0.94, 0.93].map(linear);

export function sampleSkyBaseColor(uv: Point, ambient: number): Color {
  const y = 1 - uv.y;
  const t = smooth(0, 0.85, y), warm = smooth(0.52, 0.9, y) * 0.4;
  return [
    linear(mix(mix(0.31, 0.66, t), 0.73, warm)) * ambient,
    linear(mix(mix(0.43, 0.75, t), 0.78, warm)) * ambient,
    linear(mix(mix(0.59, 0.77, t), 0.75, warm)) * ambient,
  ];
}

/**
 * Two shallow density strata approximate cloud transport. Four samples through
 * the far slab shadow the near slab along parallel lunar rays. This is a small
 * layered approximation, not a volumetric simulation or a screen-space emboss.
 * Returns straight linear RGB and opacity; the cloud pass covers the moon once.
 */
export function sampleCloudColor(
  uv: Point, aspect: number, air: Point, moonUv: Point, incident: number, ambient: number,
  cachedDepths?: readonly [number, number],
): readonly [number, number, number, number] {
  const [nearDepth, farDepth] = cachedDepths ?? cloudOpticalDepth(uv, aspect, air);
  const nearT = Math.exp(-nearDepth), farT = Math.exp(-farDepth);
  const alpha = 1 - nearT * farT;
  if (alpha < 0.00001) return [0, 0, 0, 0];
  let incomingDepth = 0;
  for (const depth of [0.04, 0.055, 0.07, 0.085]) {
    const shift = depth / (1 + depth);
    incomingDepth += layerDepth({
      x: mix(uv.x, moonUv.x, shift), y: mix(uv.y, moonUv.y, shift),
    }, aspect, air, true) * 0.25;
  }
  const dx = (uv.x - moonUv.x) * aspect, dy = uv.y - moonUv.y;
  const forward = 1 / (1 + (dx * dx + dy * dy) / 0.018);
  const scattering = Math.max(incident, 0) * (0.015 + 0.32 * forward * forward);
  const nearLight = scattering * Math.exp(-0.5 * nearDepth - incomingDepth);
  const farLight = scattering * Math.exp(-0.5 * farDepth);
  // Thin clouds scatter the broad dusk illumination into visible pearl washes.
  // Greater optical depth and the upper slab's shadow reveal cooler interiors;
  // inheriting the local sky color here would erase the clouds at startup.
  const nearDiffuse = Math.exp(-0.9 * nearDepth - 0.55 * incomingDepth);
  const farDiffuse = Math.exp(-0.75 * farDepth);
  const result = [0, 0, 0, alpha];
  for (let channel = 0; channel < 3; channel++) {
    const near = mix(NEAR_CORE[channel], CLOUD_PEARL[channel], nearDiffuse) * ambient + MOON_COLOR[channel] * nearLight;
    const far = mix(FAR_CORE[channel], CLOUD_PEARL[channel], farDiffuse) * ambient + MOON_COLOR[channel] * farLight;
    result[channel] = (near * (1 - nearT) + far * nearT * (1 - farT)) / alpha;
  }
  return result as [number, number, number, number];
}

/** The same linear sky radiance is available to water reflection and Canvas 2D. */
export function sampleSkyColor(
  uv: Point, aspect: number, air: Point, moonUv: Point, incident: number, ambient: number,
): Color {
  const base = sampleSkyBaseColor(uv, ambient);
  const cloud = sampleCloudColor(uv, aspect, air, moonUv, incident, ambient);
  return [mix(base[0], cloud[0], cloud[3]), mix(base[1], cloud[1], cloud[3]), mix(base[2], cloud[2], cloud[3])];
}
