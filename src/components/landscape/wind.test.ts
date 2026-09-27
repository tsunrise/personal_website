import {
  createBreezeProfile,
  createWind,
  sampleBreeze as sampleWeather,
} from "./wind";

const fixedNight = { seed: 0, prevailingAngle: 0.65 };
const sampleBreeze = (time: number) => sampleWeather(time, fixedNight);

test("the same night is reproducible, while different seeds change its gust pattern", () => {
  const profile = createBreezeProfile(
    jest.fn().mockReturnValueOnce(0.25).mockReturnValueOnce(0.75),
  );
  expect(profile).toEqual({ seed: 0x40000000, prevailingAngle: Math.PI * 1.5 });
  const times = [0, 2, 10, 30, 90];
  const first = times.map((time) => sampleWeather(time, profile));
  expect(times.map((time) => sampleWeather(time, { ...profile }))).toEqual(first);
  expect(
    times.map((time) => sampleWeather(time, { ...profile, seed: profile.seed + 1 })),
  ).not.toEqual(first);
});

test("a page chooses weather only once, while a fresh page chooses a new night", () => {
  const random = jest
    .spyOn(Math, "random")
    .mockReturnValueOnce(0.1)
    .mockReturnValueOnce(0.2)
    .mockReturnValueOnce(0.7)
    .mockReturnValueOnce(0.8);
  try {
    let first: ReturnType<typeof createWind>;
    jest.isolateModules(() => {
      const { createWind: createPageWind } =
        require("./wind") as typeof import("./wind");
      first = createPageWind();
      const remounted = createPageWind();
      expect(first.state).toEqual(remounted.state);
      first.advance(0.05);
      remounted.advance(0.05);
      expect(first.state).toEqual(remounted.state);
      expect(random).toHaveBeenCalledTimes(2);
    });
    jest.isolateModules(() => {
      const { createWind: createPageWind } =
        require("./wind") as typeof import("./wind");
      const nextPage = createPageWind();
      nextPage.advance(0.05);
      expect(nextPage.state.velocity).not.toEqual(first.state.velocity);
      expect(nextPage.state.waveBasis).not.toEqual(first.state.waveBasis);
      expect(random).toHaveBeenCalledTimes(4);
    });
  } finally {
    random.mockRestore();
  }
});

test("random nights stay gentle and veer gradually around every compass heading", () => {
  for (let heading = 0; heading < 8; heading++) {
    const profile = {
      seed: Math.imul(heading + 1, 0x9e3779b9),
      prevailingAngle: heading * Math.PI / 4,
    };
    let previous = sampleWeather(0, profile);
    for (let time = 0.1; time < 180; time += 0.1) {
      const wind = sampleWeather(time, profile);
      const speed = Math.hypot(wind.x, wind.z);
      const alignment =
        (wind.x * Math.cos(profile.prevailingAngle) +
          wind.z * Math.sin(profile.prevailingAngle)) / speed;
      expect(speed).toBeGreaterThanOrEqual(0.42);
      expect(speed).toBeLessThanOrEqual(2.08);
      expect(alignment).toBeGreaterThanOrEqual(Math.cos(0.62));
      expect(Math.hypot(wind.x - previous.x, wind.z - previous.z)).toBeLessThan(
        0.105,
      );
      previous = wind;
    }
  }
});

test("opposite nights reverse plants, drift, and the fixed wave basis together", () => {
  const forward = createWind(sampleBreeze);
  const reverse = createWind((time) =>
    sampleWeather(time, {
      ...fixedNight,
      prevailingAngle: fixedNight.prevailingAngle + Math.PI,
    }),
  );
  const basis = { ...reverse.state.waveBasis };
  for (let frame = 0; frame < 300; frame++) {
    forward.advance(1 / 30);
    reverse.advance(1 / 30);
  }
  for (const key of [
    "velocity", "willow", "reeds", "water", "displacement",
    "currentDisplacement", "waveBasis",
  ] as const) {
    expect(reverse.state[key].x).toBeCloseTo(-forward.state[key].x, 8);
    expect(reverse.state[key].z).toBeCloseTo(-forward.state[key].z, 8);
  }
  expect(reverse.state.waveBasis).toEqual(basis);
  expect(reverse.state.waterEnergy).toBeCloseTo(forward.state.waterEnergy, 8);
});

test("ten minutes of weather stays gentle, variable, and continuous", () => {
  let previous = sampleBreeze(0);
  const speeds: number[] = [];
  const directions: number[] = [];
  for (let t = 0; t < 600; t += 1 / 30) {
    const wind = sampleBreeze(t);
    const speed = Math.hypot(wind.x, wind.z);
    expect(speed).toBeGreaterThan(0.4);
    expect(speed).toBeLessThan(2.1);
    expect(Math.hypot(wind.x - previous.x, wind.z - previous.z)).toBeLessThan(0.035);
    speeds.push(speed);
    directions.push(Math.atan2(wind.z, wind.x));
    previous = wind;
  }
  expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.7);
  expect(Math.max(...directions) - Math.min(...directions)).toBeGreaterThan(0.35);
});

test("weather, advection, and spring responses agree across frame rates", () => {
  const atRate = (fps: number) => {
    const wind = createWind(sampleBreeze);
    for (let i = 0; i < 60 * fps; i++) wind.advance(1 / fps);
    return wind.state;
  };
  expect(atRate(30)).toEqual(atRate(60));
  expect(atRate(30)).toEqual(atRate(120));
});

test("plants respond to squared wind force; stiffer reeds respond first and water lags", () => {
  const wind = createWind((time) => ({ x: time < 1 ? 0 : 2, z: 0 }));
  for (let i = 0; i < 45; i++) wind.advance(1 / 30);
  expect(wind.state.reeds.x).toBeGreaterThan(wind.state.willow.x);
  expect(wind.state.willow.x).toBeGreaterThan(0);
  expect(wind.state.water.x).toBeGreaterThan(0);
  expect(wind.state.water.x).toBeLessThan(0.2);
  for (let i = 0; i < 300; i++) wind.advance(1 / 30);
  expect(wind.state.willow.x).toBeCloseTo(4, 3);
  expect(wind.state.reeds.x).toBeCloseTo(4, 3);
  expect(wind.state.willow.z).toBe(0);
});

test("a fading gust keeps advection continuous and leaves wave energy to settle", () => {
  const wind = createWind((time) => ({ x: time < 2 ? 2 : 0, z: 0 }));
  for (let i = 0; i < 60; i++) wind.advance(1 / 30);
  const travel = wind.state.displacement.x;
  wind.advance(1 / 30);
  expect(wind.state.displacement.x).toBeCloseTo(travel, 6);
  expect(wind.state.waterEnergy).toBeGreaterThan(3.9);
  expect(wind.state.currentDisplacement.x).toBeGreaterThan(0);
  for (let i = 0; i < 3000; i++) wind.advance(1 / 30);
  expect(wind.state.willow.x).toBeCloseTo(0, 6);
  expect(wind.state.reeds.x).toBeCloseTo(0, 6);
  expect(wind.state.waterEnergy).toBeLessThan(0.00001);
});

test("paused or invalid deltas do not advance the simulation", () => {
  const wind = createWind();
  const before = JSON.stringify(wind.state);
  [0, -1, NaN, Infinity].forEach((dt) => wind.advance(dt));
  expect(JSON.stringify(wind.state)).toBe(before);
});
