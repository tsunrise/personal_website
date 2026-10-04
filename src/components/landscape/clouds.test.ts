import {
  CLOUD_COVER, CLOUD_LAYERS, CLOUD_VISIBLE_DEPTH, cloudAtlasPoint, cloudOpticalDepth, cloudTransmission,
  createCloudProfile, getCloudAtlas, sampleCloudColor, sampleSkyBaseColor, sampleSkyColor,
} from "./clouds";
import { moonPosition } from "./composition";
import { seeded } from "./painting";
import { linearToSrgb } from "./lighting";

const still = { x: 0, y: 0 };
const nights = [3, 17, 101, 2024, 65537].map((seed) => getCloudAtlas(createCloudProfile(seeded(seed), seed)));

test("each page load draws a new sky that is cached for the page lifetime", () => {
  const atlas = getCloudAtlas();
  expect(getCloudAtlas()).toBe(atlas);
  expect(getCloudAtlas(nights[0].profile)).toBe(nights[0]);
  expect(atlas.size).toBe(512);
  expect(atlas.data).toHaveLength(512 * 512 * 4);
  expect(new Set(nights.map((night) => night.profile.seed)).size).toBe(nights.length);
  expect(nights[0].data).not.toEqual(nights[1].data);
  // The same profile reproduces the same sky.
  expect(getCloudAtlas({ ...nights[2].profile }).data).toEqual(nights[2].data);
  nights.forEach(({ profile, basis }) => {
    expect(basis[0]).toBeCloseTo(Math.cos(profile.axis), 12);
    expect(basis[1]).toBeCloseTo(Math.sin(profile.axis), 12);
  });
});

test.each(nights.map((night, i) => [i, night]))("night %i has 30% visible cloud between its two layers", (_, atlas) => {
  const { data } = atlas;
  let clear = 0, deck = 0, cirrus = 0, dense = 0, opaqueMetadata = true;
  const visible = CLOUD_VISIBLE_DEPTH / 2 * 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0 && data[i + 1] === 0) clear++;
    if (data[i] > visible) deck++;
    if (data[i + 1] > visible) cirrus++;
    if (data[i] / 255 * 2 > CLOUD_LAYERS[0].maxDepth * 0.95) dense++;
    opaqueMetadata = opaqueMetadata && data[i + 3] === 255;
  }
  const n = data.length / 4, cover = 1 - (1 - deck / n) * (1 - cirrus / n);
  // Quantile thresholds are exact apart from the small moon clearing.
  expect(cover).toBeGreaterThan(CLOUD_COVER - 0.015);
  expect(cover).toBeLessThan(CLOUD_COVER + 0.005);
  expect(cirrus / n).toBeLessThan(deck / n);
  expect(clear / n).toBeGreaterThan(0.4);
  expect(dense).toBeGreaterThan(100);
  expect(opaqueMetadata).toBe(true);
  // Cirrus is a thin veil; only the deck reaches substantial optical depth.
  let thickest = 0;
  for (let i = 1; i < data.length; i += 4) thickest = Math.max(thickest, data[i] / 255 * 2);
  expect(thickest).toBeLessThanOrEqual(CLOUD_LAYERS[1].maxDepth + 0.01);
});

test("CPU bilinear filtering agrees with GPU texel centers and halfway samples", () => {
  const atlas = nights[0], { size, data } = atlas, aspect = 1.6;
  const uv = { x: 0.3, y: 0.85 }, point = cloudAtlasPoint(uv, aspect, still, 0, atlas);
  const x = Math.floor((point.x - Math.floor(point.x)) * size - 0.5), y = Math.floor((point.y - Math.floor(point.y)) * size - 0.5);
  // Bilinear interpolation of the four texels around the projected point.
  const tx = (point.x - Math.floor(point.x)) * size - 0.5 - x, ty = (point.y - Math.floor(point.y)) * size - 0.5 - y;
  const texel = (i: number, j: number) => data[(((j % size) + size) % size * size + ((i % size) + size) % size) * 4] / 255 * 2;
  const expected = (texel(x, y) * (1 - tx) + texel(x + 1, y) * tx) * (1 - ty) + (texel(x, y + 1) * (1 - tx) + texel(x + 1, y + 1) * tx) * ty;
  const haze = Math.exp(Math.min(0, -0.1 * (1 / (uv.y - 0.295) - 1 / 0.705)));
  expect(cloudOpticalDepth(uv, aspect, still, atlas)[0]).toBeCloseTo(expected * haze, 10);
});

test("clouds lie on flat layers: perspective shrinks them toward the horizon and wind carries them", () => {
  const atlas = nights[1], aspect = 1.6;
  const tile = (layer: 0 | 1) => CLOUD_LAYERS[layer].tile;
  for (const layer of [0, 1] as const) {
    const high = cloudAtlasPoint({ x: 0.5, y: 0.9 }, aspect, still, layer, atlas);
    const highNext = cloudAtlasPoint({ x: 0.51, y: 0.9 }, aspect, still, layer, atlas);
    const low = cloudAtlasPoint({ x: 0.5, y: 0.45 }, aspect, still, layer, atlas);
    const lowNext = cloudAtlasPoint({ x: 0.51, y: 0.45 }, aspect, still, layer, atlas);
    // The same screen step spans proportionally more cloud nearer the horizon.
    const span = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(span(low, lowNext) / span(high, highNext)).toBeCloseTo((0.9 - 0.295) / (0.45 - 0.295), 6);
    // Integrated surface displacement moves the layer by its drift, in metres.
    const moved = cloudAtlasPoint({ x: 0.5, y: 0.9 }, aspect, { x: 100, y: -40 }, layer, atlas);
    expect(span(moved, high) * tile(layer)).toBeCloseTo(Math.hypot(100, 40) * CLOUD_LAYERS[layer].drift, 6);
  }
  // Repeat wrapping is seamless: a whole tile later samples the same cloud.
  const uv = { x: 0.71, y: 0.78 }, air = { x: 280, y: -170 };
  const shifted = { x: air.x + CLOUD_LAYERS[0].tile / CLOUD_LAYERS[0].drift * atlas.basis[0],
    y: air.y + CLOUD_LAYERS[0].tile / CLOUD_LAYERS[0].drift * atlas.basis[1] };
  expect(cloudOpticalDepth(uv, aspect, shifted, atlas)[0]).toBeCloseTo(cloudOpticalDepth(uv, aspect, air, atlas)[0], 8);
});

test.each([[1440, 900], [800, 600], [2560, 1080], [390, 844], [320, 800]])(
  "the initial %ix%i moon stays in a clear opening on every night", (width, height) => {
    const moon = moonPosition(width, height), aspect = width / height;
    for (const atlas of [getCloudAtlas(), ...nights]) {
      let transmission = 0;
      for (let i = 0; i < 64; i++) {
        const radius = Math.sqrt((i + 0.5) / 64) * moon.radius;
        const angle = i * 2.399963229728653;
        transmission += cloudTransmission({
          x: moon.x + Math.cos(angle) * radius / aspect,
          y: moon.y + Math.sin(angle) * radius,
        }, aspect, still, atlas);
      }
      expect(transmission / 64).toBeGreaterThan(0.98);
    }
  },
);

test("transmission is bounded, follows summed optical depth, and clears below the cloud bank", () => {
  let minimum = 1;
  for (const atlas of nights) for (let y = 0.5; y <= 1; y += 0.05) {
    for (let x = 0; x <= 4; x += 0.04) {
      const uv = { x, y }, depths = cloudOpticalDepth(uv, 1, still, atlas);
      const transmission = cloudTransmission(uv, 1, still, atlas);
      expect(depths[0]).toBeGreaterThanOrEqual(0);
      expect(depths[0]).toBeLessThanOrEqual(2);
      expect(depths[1]).toBeGreaterThanOrEqual(0);
      expect(depths[1]).toBeLessThanOrEqual(2);
      expect(transmission).toBeCloseTo(Math.exp(-depths[0] - depths[1]), 12);
      expect(transmission).toBeGreaterThanOrEqual(Math.exp(-4));
      minimum = Math.min(minimum, transmission);
    }
  }
  expect(minimum).toBeLessThan(0.3);
  // Nothing below the horizon, and only faint, hazy cloud just above it.
  expect(cloudTransmission({ x: 0.4, y: 0.1 }, 1, still)).toBe(1);
  expect(cloudTransmission({ x: 0.4, y: 0.31 }, 1, still)).toBe(1);
  nights.forEach((atlas) => expect(cloudTransmission({ x: 0.4, y: 0.33 }, 1, still, atlas)).toBeGreaterThan(0.85));
});

test("clouds cover the moon once and incident lunar light brightens them independently of ambient", () => {
  const atlas = nights[0];
  let uv = { x: 0, y: 0.8 }, best = 1;
  for (let y = 0.6; y < 1; y += 0.02) {
    for (let x = 0; x < 4; x += 0.02) {
      const transmission = cloudTransmission({ x, y }, 1, still, atlas);
      if (transmission < best) { best = transmission; uv = { x, y }; }
    }
  }
  const dark = sampleCloudColor(uv, 1, still, uv, 0, 0.9, undefined, atlas);
  const lit = sampleCloudColor(uv, 1, still, uv, 1, 0.9, undefined, atlas);
  expect(lit[3]).toBeGreaterThan(0.5);
  expect(lit[3]).toBeCloseTo(1 - cloudTransmission(uv, 1, still, atlas), 12);
  expect(dark[3]).toBe(lit[3]);
  for (let channel = 0; channel < 3; channel++) {
    expect(lit[channel]).toBeGreaterThan(dark[channel]);
    expect(dark[channel]).toBeGreaterThan(0);
  }
  const unlitSky = sampleSkyColor(uv, 1, still, uv, 0, 0.9);
  expect(unlitSky.every((component) => component > 0 && component < 1)).toBe(true);
});

test.each([[1440, 900], [800, 600], [390, 844], [320, 800]])(
  "startup clouds remain visibly brighter than the upper %ix%i sky", (width, height) => {
    const aspect = width / height, moon = moonPosition(width, height);
    for (const atlas of nights) {
      let visible = 0, total = 0, peakContrast = 0;
      // Check the actual display-space alpha composite, above the mountain ridges.
      // Density alone did not catch the regression where cloud color matched sky.
      for (let y = 0.72; y < 0.98; y += 0.015) {
        for (let x = 0.02; x < 0.98; x += 0.015) {
          const uv = { x, y }, base = sampleSkyBaseColor(uv, 1);
          const cloud = sampleCloudColor(uv, aspect, still, moon, 1, 1, undefined, atlas);
          let contrast = 0;
          for (let channel = 0; channel < 3; channel++) {
            contrast += (linearToSrgb(cloud[channel]) - linearToSrgb(base[channel])) * cloud[3] / 3;
          }
          if (contrast > 0.035) visible++;
          peakContrast = Math.max(peakContrast, contrast);
          total++;
        }
      }
      // Placement keeps scattered cloud in view; a narrow portrait sky sees less.
      expect(visible / total).toBeGreaterThan(aspect < 0.85 ? 0.04 : 0.08);
      expect(peakContrast).toBeGreaterThan(0.08);
    }
  },
);

test("pearl thin clouds retain blue dense interiors and bounded lunar silver light", () => {
  const uv = { x: 0.5, y: 0.8 };
  const thin = sampleCloudColor(uv, 1, still, uv, 0, 1, [0.15, 0.1]);
  const dense = sampleCloudColor(uv, 1, still, uv, 0, 1, [2, 2]);
  const silver = sampleCloudColor(uv, 1, still, uv, 1, 1, [0.15, 0.1]);
  expect(dense[2]).toBeGreaterThan(dense[0] * 1.3);
  for (let channel = 0; channel < 3; channel++) {
    expect(thin[channel]).toBeGreaterThan(dense[channel]);
    expect(silver[channel]).toBeGreaterThan(thin[channel]);
    expect(silver[channel]).toBeLessThan(1);
  }
  expect(silver[3]).toBe(thin[3]);
});
