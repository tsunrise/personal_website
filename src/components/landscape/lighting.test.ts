import {
  atmosphericTransmission, lightResponse, lightingGain, linearToSrgb, moonRadiance,
} from "./lighting";

test("reference moon preserves each material and hiding it retains ambient illumination", () => {
  for (const strength of [0.24, 0.26, 0.28, 0.3, 0.32]) {
    for (const response of [0, 0.2, 0.7, 1]) {
      expect(lightingGain(response, response, 1, strength)).toBe(1);
      const hidden = lightingGain(response, response, 0, strength);
      expect(hidden).toBeGreaterThanOrEqual(1 - strength);
      expect(hidden).toBeLessThanOrEqual(1);
      expect(lightingGain(response, response, 0.5, strength)).toBeCloseTo(
        (hidden + 1) / 2,
      );
    }
  }
});

test("opposing masonry faces exchange illumination when the moon changes sides", () => {
  const rightMoon = [0.6, 0.3, Math.sqrt(0.55)];
  const leftMoon = [-0.6, 0.3, Math.sqrt(0.55)];
  expect(lightResponse(1, 0, 0, rightMoon)).toBeGreaterThan(
    lightResponse(-1, 0, 0, rightMoon),
  );
  expect(lightResponse(-1, 0, 0, leftMoon)).toBeGreaterThan(
    lightResponse(1, 0, 0, leftMoon),
  );
  expect(lightResponse(0, 1, 0, rightMoon)).toEqual(
    lightResponse(0, 1, 0, leftMoon),
  );
});

test("higher moon lights horizontal stone and leaves transmit backlighting", () => {
  const highMoon = [0, 0.8, 0.6], lowMoon = [0, 0.1, Math.sqrt(0.99)];
  expect(lightResponse(0, 1, 0, highMoon)).toBeGreaterThan(
    lightResponse(0, 1, 0, lowMoon),
  );
  expect(lightResponse(0, 0, -1, highMoon)).toBe(0);
  expect(lightResponse(0, 0, -1, highMoon, true)).toBeGreaterThan(0);
  expect(lightResponse(0, 0, -1, highMoon, true)).toBeCloseTo(
    lightResponse(0, 0, 1, highMoon, true) * 0.3,
  );
});

test("ambient gain scales retained light without changing the reference normalization", () => {
  expect(lightingGain(1, 1, 0, 0.3, 0.88)).toBeCloseTo(0.7 * 0.88);
  expect(lightingGain(0, 0, 0, 0.3, 0.88)).toBeCloseTo(0.88);
  expect(lightingGain(0.5, 0.5, 1, 0.3, 1)).toBe(1);
});

test("moon display preserves the authored reference, including tones below the reference sky", () => {
  for (const sky of [0.04, 0.15, 0.4]) {
    for (const authored of [0, 0.02, 0.3, 0.7, 1]) {
      expect(moonRadiance(authored, sky, sky, 1)).toBeCloseTo(authored, 12);
    }
  }
  expect(moonRadiance(0, 0.1, 0.4, 1)).toBe(0);
});

test("zero incident transmission makes the moon converge to local sky rather than black", () => {
  for (const sky of [0.05, 0.3, 0.6]) {
    for (const authored of [0, 0.4, 1]) {
      expect(moonRadiance(authored, sky, 0.15, 0)).toBe(sky);
    }
  }
});

test("positive lunar contrast grows monotonically with transmission and stays finite at the horizon", () => {
  const currentSky = 0.4, referenceSky = 0.12, authored = 0.65;
  let previous = currentSky;
  for (const transmission of [0, 0.02, 0.2, 0.6, 1, 1.1]) {
    const radiance = moonRadiance(authored, currentSky, referenceSky, transmission);
    expect(radiance).toBeGreaterThanOrEqual(previous);
    previous = radiance;
  }
  const referenceTransmission = atmosphericTransmission(0.5);
  for (const elevation of [0, 1e-8, 0.001, 0.01]) {
    const incident = atmosphericTransmission(elevation) / referenceTransmission;
    const radiance = moonRadiance(authored, currentSky, referenceSky, incident);
    expect(Number.isFinite(radiance)).toBe(true);
    expect(radiance).toBeGreaterThan(currentSky);
    expect(radiance).toBeLessThan(currentSky + 0.04);
  }
});

test("retained halo alpha cannot create a dark ring as positive moon contrast disappears", () => {
  const currentSky = 0.45, referenceSky = 0.13, authoredHalo = 0.72;
  for (const alpha of [0, 0.01, 0.13, 0.5, 1]) {
    for (const incident of [0, 0.02, 0.3, 1]) {
      const halo = moonRadiance(authoredHalo, currentSky, referenceSky, incident);
      const composited = currentSky * (1 - alpha) + halo * alpha;
      expect(composited).toBeGreaterThanOrEqual(currentSky - 1e-12);
      expect(composited - currentSky).toBeCloseTo(alpha * incident * (authoredHalo - referenceSky), 12);
      // Existing Canvas/WebGL display-space alpha blending also retains this floor.
      const display = linearToSrgb(currentSky) * (1 - alpha) + linearToSrgb(halo) * alpha;
      expect(display).toBeGreaterThanOrEqual(linearToSrgb(currentSky) - 1e-12);
    }
  }
});
