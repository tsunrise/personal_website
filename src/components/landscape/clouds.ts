import { moonPosition, WATER_HORIZON } from "./composition";
import { pageBreeze } from "./wind";

type Point = { x: number; y: number };
type Plane = { x: number; z: number };
type Color = readonly [number, number, number];

/**
 * One night's sky. Coverage is the observer's fraction of sky with visible
 * cloud (optical depth > CLOUD_VISIBLE_DEPTH), as in oktas: 30% is about 2.4
 * oktas, between "few" and "scattered". A mid-level altocumulus deck and high
 * cirrus share it.
 */
export interface CloudProfile {
  seed: number;
  /** Prevailing world X/Z direction that elongates cloud elements, radians. */
  axis: number;
  /** Share of the cover contributed by the cirrus veil rather than the deck. */
  highShare: number;
}

/** A small, immutable optical-depth atlas shared by the CPU and GPU. */
export interface CloudAtlas {
  size: number;
  data: Uint8Array;
  profile: CloudProfile;
  /** Atlas offsets: near.x, near.y, far.x, far.y. */
  phase: readonly [number, number, number, number];
  /** cos/sin of the profile axis; atlas +X runs along it. */
  basis: readonly [number, number];
}

export const CLOUD_COVER = 0.3;
export const CLOUD_VISIBLE_DEPTH = 0.1;
// Flat layers above the water camera: a summer-night altocumulus deck after
// daytime convection has collapsed, and thin cirrus near the tropopause. Drift
// multiplies the integrated surface wind for the faster winds aloft.
export const CLOUD_LAYERS = [
  { altitude: 2400, tile: 26000, drift: 6, maxDepth: 1.7, core: 0.1 },
  { altitude: 8000, tile: 64000, drift: 10, maxDepth: 0.45, core: 0.15 },
] as const;
// Plane X is measured from this sky azimuth so the moon's default position
// lands on the same cloud gap in every aspect ratio.
export const CLOUD_ANCHOR = 0.8;
// Below this rise above the horizon, slant distance is effectively unbounded.
export const CLOUD_MIN_RISE = 0.02;
// Vertical optical depth of the hazy boundary layer between the eye and clouds,
// normalized at the top of the frame: low clouds lose contrast into airlight.
export const CLOUD_HAZE = 0.1;
const TOP_RISE = 1 - WATER_HORIZON;

const SIZE = 512;
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

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCloudProfile(random = Math.random, prevailing = pageBreeze.prevailingAngle): CloudProfile {
  return {
    seed: Math.floor(random() * 0x100000000),
    // Upper winds turn with height; keep elements roughly aligned with the drift.
    axis: prevailing + (random() - 0.5) * 0.5,
    highShare: 0.15 + random() * 0.3,
  };
}

// Choose the night's sky once per page load, alongside the breeze.
const pageClouds = createCloudProfile();
const atlases = new WeakMap<CloudProfile, CloudAtlas>();

/** Periodic value noise with quintic fades; integer periods tile seamlessly. */
type Lattice = { px: number; py: number; values: Float32Array };
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function lattice(px: number, py: number, seed: number): Lattice {
  const values = new Float32Array(px * py);
  for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) values[y * px + x] = hash(x, y, seed);
  return { px, py, values };
}
/** Arbitrary points, for warped lookups; x/y stay within about one tile of [0, 1). */
function noise({ px, py, values }: Lattice, x: number, y: number) {
  const fx = x * px, fy = y * py, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fade(fx - ix), ty = fade(fy - iy);
  let x0 = ix % px, y0 = iy % py;
  if (x0 < 0) x0 += px;
  if (y0 < 0) y0 += py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, r0 = y0 * px, r1 = y0 + 1 === py ? 0 : r0 + px;
  const a = values[r0 + x0], b = values[r0 + x1], c = values[r1 + x0], d = values[r1 + x1];
  return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
}
function octaves(px: number, py: number, count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => lattice(px << i, py << i, seed + i * 7919));
}
function fbm(layers: Lattice[], x: number, y: number) {
  let value = 0, amplitude = 1, total = 0;
  for (const layer of layers) {
    value += noise(layer, x, y) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  return value / total;
}
/**
 * The same fBm at every texel centre, tabulated: lattice cells and fades once
 * per row and column instead of per texel.
 */
function fbmGrid(layers: Lattice[]) {
  const out = new Float32Array(SIZE * SIZE);
  const axis = (period: number) => {
    const cell = new Int32Array(SIZE), next = new Int32Array(SIZE), weight = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const p = ((i + 0.5) / SIZE) * period, index = Math.floor(p);
      cell[i] = index % period;
      next[i] = cell[i] + 1 === period ? 0 : cell[i] + 1;
      weight[i] = fade(p - index);
    }
    return { cell, next, weight };
  };
  let amplitude = 1, total = 0;
  for (const { px, py, values } of layers) {
    const xs = axis(px), ys = axis(py);
    for (let j = 0; j < SIZE; j++) {
      const r0 = ys.cell[j] * px, r1 = ys.next[j] * px, ty = ys.weight[j];
      for (let i = 0; i < SIZE; i++) {
        const x0 = xs.cell[i], x1 = xs.next[i], tx = xs.weight[i];
        const a = values[r0 + x0], b = values[r0 + x1], c = values[r1 + x0], d = values[r1 + x1];
        out[j * SIZE + i] += (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Inverse of smoothstep on [0, 1]. */
const unsmooth = (s: number) => 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);

/**
 * Map a density field to optical depth so that exactly `cover` of the tile is
 * visible cloud and the densest `cover × core` reaches the layer's full depth.
 */
function thresholds(field: Float32Array, cover: number, core: number, maxDepth: number) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const bins = new Uint32Array(4096), scale = (bins.length - 1) / (max - min || 1);
  for (let i = 0; i < field.length; i++) bins[Math.round((field[i] - min) * scale)]++;
  const quantile = (q: number) => {
    let count = 0;
    const target = q * field.length;
    for (let i = 0; i < bins.length; i++) {
      count += bins[i];
      if (count >= target) return min + i / scale;
    }
    return max;
  };
  const visible = quantile(1 - cover), full = Math.max(quantile(1 - cover * core), visible + 1e-4);
  const t = unsmooth(Math.pow(CLOUD_VISIBLE_DEPTH / maxDepth, 1 / 1.5));
  const width = (full - visible) / (1 - t);
  return { low: visible - t * width, high: visible - t * width + width };
}

/**
 * Atlas X runs along the profile axis. The deck is mesoscale patches of
 * slightly wind-stretched cells with warped, eroded edges; cirrus is long,
 * gently bent fibres in broad veils. Neither is a volumetric simulation.
 */
function densityFields(seed: number) {
  const near = new Float32Array(SIZE * SIZE), far = new Float32Array(SIZE * SIZE);
  // Broad fields are evaluated on the texel grid; only the warped detail is not.
  const warpX = fbmGrid(octaves(4, 4, 2, seed ^ 0x1f3)), warpY = fbmGrid(octaves(4, 4, 2, seed ^ 0x2a7));
  const groups = fbmGrid([lattice(3, 3, seed ^ 0x3b1)]), bend = fbmGrid([lattice(3, 3, seed ^ 0x5d3)]);
  const veil = fbmGrid([lattice(2, 2, seed ^ 0x6e5)]);
  const cells = octaves(7, 11, 4, seed ^ 0x4c9), fibres = octaves(4, 18, 3, seed ^ 0x7f1);
  for (let j = 0; j < SIZE; j++) {
    const y = (j + 0.5) / SIZE;
    for (let i = 0; i < SIZE; i++) {
      const x = (i + 0.5) / SIZE, index = j * SIZE + i;
      const wx = x + (warpX[index] - 0.5) * 0.07, wy = y + (warpY[index] - 0.5) * 0.07;
      near[index] = fbm(cells, wx, wy) * 0.74 + groups[index] * 0.26;
      far[index] = fbm(fibres, x, y + (bend[index] - 0.5) * 0.12) * 0.55 + veil[index] * 0.45;
    }
  }
  return [near, far];
}

/** Layer covers whose overlap gives CLOUD_COVER: 1 − (1 − near)(1 − far). */
function layerCovers(profile: CloudProfile) {
  const far = CLOUD_COVER * profile.highShare;
  return [1 - (1 - CLOUD_COVER) / (1 - far), far];
}

/** Sky UV → this layer's flat-plane metres, through the water camera (focal length 1). */
function planePoint(uv: Point, aspect: number, altitude: number): Plane {
  const z = altitude / Math.max(uv.y - WATER_HORIZON, CLOUD_MIN_RISE);
  return { x: (uv.x - CLOUD_ANCHOR) * aspect * z, z };
}

/** Aerial perspective: low clouds sit behind a longer path through the haze. */
function haze(rise: number) {
  if (rise <= CLOUD_MIN_RISE) return 0;
  return smooth(CLOUD_MIN_RISE, CLOUD_MIN_RISE * 3, rise)
    * Math.exp(Math.min(0, -CLOUD_HAZE * (1 / rise - 1 / TOP_RISE)));
}

function atlasPoint(uv: Point, aspect: number, air: Point, layer: 0 | 1, atlas: CloudAtlas) {
  const { altitude, tile, drift } = CLOUD_LAYERS[layer];
  const plane = planePoint(uv, aspect, altitude);
  const x = plane.x - air.x * drift, z = plane.z - air.y * drift;
  const [c, s] = atlas.basis;
  return { x: (x * c + z * s) / tile + atlas.phase[layer * 2], y: (z * c - x * s) / tile + atlas.phase[layer * 2 + 1] };
}

/** Match RepeatWrapping + bilinear filtering with flipY=false, including texel centers. */
function sampleAtlas({ size, data }: { size: number; data: Uint8Array }, u: number, v: number, channel: number) {
  const x = (u - Math.floor(u)) * size - 0.5;
  const y = (v - Math.floor(v)) * size - 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
  const sample = (dx: number, dy: number) =>
    data[(wrap(iy + dy, size) * size + wrap(ix + dx, size)) * 4 + channel] / 255;
  return mix(mix(sample(0, 0), sample(1, 0), tx), mix(sample(0, 1), sample(1, 1), tx), ty);
}

/** Moon discs, with a margin, for each composition across representative aspects. */
function startupMoons() {
  const discs: { uv: Point; aspect: number; radius: number }[] = [];
  for (const [width, height] of [[850, 1000], [1600, 1000], [2600, 1000], [400, 1000], [620, 1000], [845, 1000]]) {
    const moon = moonPosition(width, height);
    discs.push({ uv: moon, aspect: width / height, radius: moon.radius * 1.3 });
  }
  return discs;
}

/** Disc samples projected onto a layer (centre plus two rings), each with a clearing radius in metres. */
function discPoints(layer: 0 | 1) {
  const points: { plane: Plane; clear: number }[] = [];
  const { altitude } = CLOUD_LAYERS[layer];
  for (const { uv, aspect, radius } of startupMoons()) {
    const centre = planePoint(uv, aspect, altitude), clear = radius * centre.z * 0.45;
    points.push({ plane: centre, clear });
    for (let i = 0; i < 20; i++) {
      const angle = i * Math.PI / 10, r = radius * (i % 2 ? 1 : 0.6);
      points.push({ plane: planePoint({ x: uv.x + Math.cos(angle) * r / aspect, y: uv.y + Math.sin(angle) * r }, aspect, altitude), clear });
    }
  }
  return points;
}

/** Upper and middle sky seen at startup in both compositions, as separate regions. */
function windowRegions(layer: 0 | 1) {
  const regions: { plane: Plane; haze: number }[][] = [];
  for (const aspect of [1.6, 0.42]) {
    for (const [y0, y1] of [[0.72, 0.99], [0.5, 0.72]]) {
      const points: { plane: Plane; haze: number }[] = [];
      for (let y = y0; y < y1; y += 0.03) {
        for (let x = 0.03; x < 0.99; x += 0.06) {
          points.push({ plane: planePoint({ x, y }, aspect, CLOUD_LAYERS[layer].altitude), haze: haze(y - WATER_HORIZON) });
        }
      }
      regions.push(points);
    }
  }
  return regions;
}

/**
 * Pick where tonight's field starts: the moon's default disc in a natural gap
 * and each visible region of sky near the night's cover. A soft clearing in the
 * atlas, moving with the clouds, guarantees the gap if no candidate is clear.
 */
function placeLayer(data: Uint8Array, layer: 0 | 1, basis: readonly [number, number], cover: number, random: () => number) {
  const { tile, maxDepth } = CLOUD_LAYERS[layer], [c, s] = basis;
  const toAtlas = (p: Plane, phase: Point) => ({ x: (p.x * c + p.z * s) / tile + phase.x, y: (p.z * c - p.x * s) / tile + phase.y });
  const moon = discPoints(layer), regions = windowRegions(layer), atlas = { size: SIZE, data };
  const depth = (p: Plane, phase: Point) => {
    const a = toAtlas(p, phase);
    return sampleAtlas(atlas, a.x, a.y, layer) * 2;
  };
  let best = { x: 0, y: 0 }, bestScore = Infinity;
  for (let i = 0; i < 400; i++) {
    const phase = { x: random(), y: random() };
    let score = 0;
    for (const { plane } of moon) {
      score += depth(plane, phase) * 10 / maxDepth;
      if (score >= bestScore) break;
    }
    for (const region of regions) {
      if (score >= bestScore) break;
      let covered = 0;
      for (const { plane, haze: fade } of region) if (depth(plane, phase) * fade > CLOUD_VISIBLE_DEPTH) covered++;
      // An empty startup view reads as a clear night: penalize it more than excess.
      const fraction = covered / region.length;
      score += (Math.abs(fraction - cover) + Math.max(0, cover * 0.5 - fraction) * 3) / regions.length;
    }
    if (score < bestScore) { bestScore = score; best = phase; }
  }
  // Clear soft-edged circles around the disc samples, in plane metres. The
  // clearing belongs to the atlas, so it drifts away with the clouds.
  const texel = tile / SIZE;
  for (const { plane, clear } of moon) {
    const centre = toAtlas(plane, best), reach = Math.ceil(clear * 2.5 / texel);
    const ci = Math.floor(wrap(centre.x, 1) * SIZE), cj = Math.floor(wrap(centre.y, 1) * SIZE);
    for (let j = cj - reach; j <= cj + reach; j++) {
      for (let i = ci - reach; i <= ci + reach; i++) {
        const dx = ((i + 0.5) / SIZE - wrap(centre.x, 1)) * tile, dy = ((j + 0.5) / SIZE - wrap(centre.y, 1)) * tile;
        const index = (wrap(j, SIZE) * SIZE + wrap(i, SIZE)) * 4 + layer;
        data[index] = Math.round(data[index] * smooth(clear, clear * 2.5, Math.hypot(dx, dy)));
      }
    }
  }
  return best;
}

export function getCloudAtlas(profile = pageClouds): CloudAtlas {
  const cached = atlases.get(profile);
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const fields = densityFields(profile.seed), covers = layerCovers(profile);
  const ranges = fields.map((field, layer) => {
    const { maxDepth, core } = CLOUD_LAYERS[layer];
    return thresholds(field, covers[layer], core, maxDepth);
  });
  for (let layer = 0; layer < 2; layer++) {
    const { low, high } = ranges[layer], field = fields[layer], gain = CLOUD_LAYERS[layer].maxDepth / 2 * 255;
    for (let i = 0; i < SIZE * SIZE; i++) {
      let t = (field[i] - low) / (high - low);
      t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      // R/G each encode optical depth / 2, shaped as smoothstep^1.5; B is reserved.
      data[i * 4 + layer] = Math.round(t * Math.sqrt(t) * gain);
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const basis = [Math.cos(profile.axis), Math.sin(profile.axis)] as const;
  const random = seededRandom(profile.seed ^ 0x9e3779b9);
  const near = placeLayer(data, 0, basis, covers[0], random), far = placeLayer(data, 1, basis, covers[1], random);
  const atlas: CloudAtlas = { size: SIZE, data, profile, basis, phase: [near.x, near.y, far.x, far.y] };
  atlases.set(profile, atlas);
  return atlas;
}

/** Atlas coordinates of a sky UV in one layer, before repeat wrapping. */
export function cloudAtlasPoint(uv: Point, aspect: number, air: Point, layer: 0 | 1, atlas = getCloudAtlas()) {
  return atlasPoint(uv, aspect, air, layer, atlas);
}

function layerDepth(uv: Point, aspect: number, air: Point, far: boolean, atlas: CloudAtlas) {
  const rise = uv.y - WATER_HORIZON;
  if (rise <= CLOUD_MIN_RISE) return 0;
  const layer = far ? 1 : 0, point = atlasPoint(uv, aspect, air, layer, atlas);
  return sampleAtlas(atlas, point.x, point.y, layer) * 2 * haze(rise);
}

/** UV is the sky artwork's +Y-up space, before overscan and layer parallax. */
export function cloudOpticalDepth(
  uv: Point, aspect: number, air: Point, atlas = getCloudAtlas(),
): readonly [number, number] {
  return [layerDepth(uv, aspect, air, false, atlas), layerDepth(uv, aspect, air, true, atlas)];
}

export function cloudTransmission(uv: Point, aspect: number, air: Point, atlas = getCloudAtlas()) {
  const depths = cloudOpticalDepth(uv, aspect, air, atlas);
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
  cachedDepths?: readonly [number, number], atlas = getCloudAtlas(),
): readonly [number, number, number, number] {
  const [nearDepth, farDepth] = cachedDepths ?? cloudOpticalDepth(uv, aspect, air, atlas);
  const nearT = Math.exp(-nearDepth), farT = Math.exp(-farDepth);
  const alpha = 1 - nearT * farT;
  if (alpha < 0.00001) return [0, 0, 0, 0];
  let incomingDepth = 0;
  for (const depth of [0.04, 0.055, 0.07, 0.085]) {
    const shift = depth / (1 + depth);
    incomingDepth += layerDepth({
      x: mix(uv.x, moonUv.x, shift), y: mix(uv.y, moonUv.y, shift),
    }, aspect, air, true, atlas) * 0.25;
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
