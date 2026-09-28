import { lightResponse, lightingGain } from "./lighting";

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
  expect(lightResponse(0, 0, -1, highMoon, true)).toEqual(
    lightResponse(0, 0, 1, highMoon, true),
  );
});
