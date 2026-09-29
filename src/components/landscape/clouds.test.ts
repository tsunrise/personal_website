import { cloudOpticalDepth, cloudTransmission, getCloudAtlas, sampleCloudColor, sampleSkyBaseColor, sampleSkyColor } from "./clouds";
import { moonPosition } from "./composition";
import { linearToSrgb } from "./lighting";

const still = { x: 0, y: 0 };

test("the seeded periodic optical-depth atlas is cached and contains clear and dense cloud", () => {
  const atlas = getCloudAtlas();
  expect(getCloudAtlas()).toBe(atlas);
  expect(atlas.size).toBe(512);
  expect(atlas.data).toHaveLength(512 * 512 * 4);
  let clear = 0, dense = 0, opaqueMetadata = true;
  for (let i = 0; i < atlas.data.length; i += 4) {
    if (atlas.data[i] === 0 && atlas.data[i + 1] === 0) clear++;
    if (atlas.data[i] > 220 && atlas.data[i + 1] > 220) dense++;
    opaqueMetadata = opaqueMetadata && atlas.data[i + 3] === 255;
  }
  expect(clear).toBeGreaterThan(10000);
  expect(dense).toBeGreaterThan(10);
  expect(opaqueMetadata).toBe(true);
});

test("CPU bilinear filtering agrees with GPU texel centers and halfway samples", () => {
  const { size, data } = getCloudAtlas();
  const x = 210, y = 168;
  const uv = { x: ((x + 0.5) / size - 0.495) * 4, y: ((y + 0.5) / size - 0.14) * 4 };
  const a = data[(y * size + x) * 4] / 255 * 2;
  const b = data[(y * size + x + 1) * 4] / 255 * 2;
  expect(cloudOpticalDepth(uv, 1, still)[0]).toBeCloseTo(a, 12);
  expect(cloudOpticalDepth({ ...uv, x: uv.x + 2 / size }, 1, still)[0]).toBeCloseTo((a + b) / 2, 12);
});

test("CPU sampling wraps through the atlas seam and follows integrated advection", () => {
  const aspect = 1.7, uv = { x: 0.71, y: 0.78 }, air = { x: 280, y: -170 };
  const depths = cloudOpticalDepth(uv, aspect, air);
  const repeated = cloudOpticalDepth({ ...uv, x: uv.x + 4 / aspect }, aspect, air);
  const moved = cloudOpticalDepth({ x: uv.x - air.x * 0.0015 / aspect, y: uv.y - air.y * 0.0003 }, aspect, still);
  depths.forEach((depth, i) => {
    expect(repeated[i]).toBeCloseTo(depth, 10);
    expect(moved[i]).toBeCloseTo(depth, 10);
  });
  const seam = -0.495 * 4 / aspect;
  const before = cloudOpticalDepth({ x: seam - 1e-7, y: 0.8 }, aspect, still);
  const after = cloudOpticalDepth({ x: seam + 1e-7, y: 0.8 }, aspect, still);
  expect(Math.abs(before[0] - after[0])).toBeLessThan(0.0001);
});

test.each([[1440, 900], [800, 600], [390, 844], [320, 800]])(
  "the initial %ix%i moon stays in a clear opening without removing other clouds", (width, height) => {
    const moon = moonPosition(width, height), aspect = width / height;
    let transmission = 0;
    for (let i = 0; i < 64; i++) {
      const radius = Math.sqrt((i + 0.5) / 64) * moon.radius;
      const angle = i * 2.399963229728653;
      transmission += cloudTransmission({
        x: moon.x + Math.cos(angle) * radius / aspect,
        y: moon.y + Math.sin(angle) * radius,
      }, aspect, still);
    }
    expect(transmission / 64).toBeGreaterThan(0.98);
  },
);

test("transmission is bounded, follows summed optical depth, and clears below the cloud bank", () => {
  let minimum = 1;
  for (let y = 0.5; y <= 1; y += 0.05) {
    for (let x = 0; x <= 4; x += 0.04) {
      const uv = { x, y }, depths = cloudOpticalDepth(uv, 1, still);
      const transmission = cloudTransmission(uv, 1, still);
      expect(depths[0]).toBeGreaterThanOrEqual(0);
      expect(depths[0]).toBeLessThanOrEqual(2);
      expect(depths[1]).toBeGreaterThanOrEqual(0);
      expect(depths[1]).toBeLessThanOrEqual(2);
      expect(transmission).toBeCloseTo(Math.exp(-depths[0] - depths[1]), 12);
      expect(transmission).toBeGreaterThanOrEqual(Math.exp(-4));
      minimum = Math.min(minimum, transmission);
    }
  }
  expect(minimum).toBeLessThan(0.25);
  expect(cloudTransmission({ x: 0.4, y: 0.1 }, 1, still)).toBe(1);
});

test("clouds cover the moon once and incident lunar light brightens them independently of ambient", () => {
  let uv = { x: 0, y: 0.8 };
  for (let x = 0; x < 4; x += 0.02) {
    if (cloudTransmission({ x, y: 0.8 }, 1, still) < 0.5) { uv = { x, y: 0.8 }; break; }
  }
  const dark = sampleCloudColor(uv, 1, still, uv, 0, 0.9);
  const lit = sampleCloudColor(uv, 1, still, uv, 1, 0.9);
  expect(lit[3]).toBeGreaterThan(0.5);
  expect(lit[3]).toBeCloseTo(1 - cloudTransmission(uv, 1, still), 12);
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
    let visible = 0, total = 0, peakContrast = 0;
    // Check the actual display-space alpha composite, above the mountain ridges.
    // Density alone did not catch the regression where cloud color matched sky.
    for (let y = 0.72; y < 0.98; y += 0.015) {
      for (let x = 0.02; x < 0.98; x += 0.015) {
        const uv = { x, y }, base = sampleSkyBaseColor(uv, 1);
        const cloud = sampleCloudColor(uv, aspect, still, moon, 1, 1);
        let contrast = 0;
        for (let channel = 0; channel < 3; channel++) {
          contrast += (linearToSrgb(cloud[channel]) - linearToSrgb(base[channel])) * cloud[3] / 3;
        }
        if (contrast > 0.035) visible++;
        peakContrast = Math.max(peakContrast, contrast);
        total++;
      }
    }
    expect(visible / total).toBeGreaterThan(aspect < 0.85 ? 0.04 : 0.12);
    expect(peakContrast).toBeGreaterThan(0.10);
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
