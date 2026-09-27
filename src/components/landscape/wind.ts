export interface WindVector {
  x: number;
  z: number;
}

export interface BreezeProfile {
  seed: number;
  prevailingAngle: number;
}

export function createBreezeProfile(random = Math.random): BreezeProfile {
  return {
    seed: Math.floor(random() * 0x100000000),
    prevailingAngle: random() * Math.PI * 2,
  };
}

// Choose the night once per page load, independently of the artwork's seed.
// Module lifetime also keeps React remounts/Strict Mode from choosing new weather.
const pageBreeze = createBreezeProfile();

// World coordinates: +x is right, +z is across the river, away from the viewer.
// Quintic value noise gives correlated gusts without a repeating sine-wave beat.
function weatherNoise(time: number, seed: number) {
  const cell = Math.floor(time);
  const hash = (n: number) => {
    let value = Math.imul(n ^ seed, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const f = time - cell;
  const blend = f * f * f * (f * (f * 6 - 15) + 10);
  return (hash(cell) * (1 - blend) + hash(cell + 1) * blend) * 2 - 1;
}

/** A sheltered summer breeze, in m/s; light air to the low end of light breeze. */
export function sampleBreeze(
  time: number,
  profile: BreezeProfile = pageBreeze,
): WindVector {
  const speed =
    1.25 +
    0.48 * weatherNoise(time / 19, profile.seed ^ 71) +
    0.26 * weatherNoise(time / 5.7, profile.seed ^ 193) +
    0.09 * weatherNoise(time / 1.9, profile.seed ^ 811);
  const angle =
    profile.prevailingAngle +
    0.48 * weatherNoise(time / 37, profile.seed ^ 503) +
    0.14 * weatherNoise(time / 11, profile.seed ^ 997);
  return { x: Math.cos(angle) * speed, z: Math.sin(angle) * speed };
}

const vector = (): WindVector => ({ x: 0, z: 0 });
const STEP = 1 / 120;

/** A handful of scalar updates per frame; no particles, grids, or timers. */
export function createWind(sample = sampleBreeze) {
  const initial = sample(0);
  const speed = Math.hypot(initial.x, initial.z);
  const initialBend = { x: initial.x * speed, z: initial.z * speed };
  const state = {
    time: 0,
    velocity: { ...initial },
    // Orient the water spectrum once, then let its amplitudes respond to gusts.
    // Keeping this basis fixed prevents existing crests swivelling as wind veers.
    waveBasis:
      speed > 0
        ? { x: initial.x / speed, z: initial.z / speed }
        : { x: 1, z: 0 },
    // Integrate velocity, rather than multiplying the latest speed by time:
    // clouds and mist must not jump backwards when a gust subsides.
    displacement: vector(),
    willow: { ...initialBend },
    reeds: { ...initialBend },
    water: { ...initial },
    waterEnergy: initial.x * initial.x + initial.z * initial.z,
    currentDisplacement: vector(),
  };
  const willowVelocity = vector();
  const reedVelocity = vector();
  let remainder = 0;
  function spring(
    position: WindVector,
    velocity: WindVector,
    force: WindVector,
    frequency: number,
    damping: number,
  ) {
    for (const axis of ["x", "z"] as const) {
      velocity[axis] +=
        (frequency * frequency * (force[axis] - position[axis]) -
          2 * damping * frequency * velocity[axis]) *
        STEP;
      position[axis] += velocity[axis] * STEP;
    }
  }
  return {
    state,
    advance(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return state;
      // The render clock excludes hidden/paused time; bound unexpected long frames.
      remainder += Math.min(dt, 0.25);
      while (remainder + 1e-10 >= STEP) {
        remainder -= STEP;
        state.time += STEP;
        const wind = sample(state.time);
        const speed = Math.hypot(wind.x, wind.z);
        const drag = { x: wind.x * speed, z: wind.z * speed };
        state.velocity = wind;
        // Lightly underdamped stems follow a gust, then gently recoil as it
        // eases. Reeds settle sooner than the longer hanging willow shoots.
        // Match the softer shader bend with a slightly longer natural period.
        spring(state.willow, willowVelocity, drag, 2.15, 0.5);
        spring(state.reeds, reedVelocity, drag, 3.27, 0.58);
        const memory = 1 - Math.exp(-STEP / 7);
        for (const axis of ["x", "z"] as const) {
          state.displacement[axis] += wind[axis] * STEP;
          state.water[axis] += (wind[axis] - state.water[axis]) * memory;
          // Small surface drift, about 1.5% of wind speed. Gravity waves have
          // their own dispersion speed; they are not painted onto this drift.
          state.currentDisplacement[axis] += state.water[axis] * 0.015 * STEP;
        }
        state.waterEnergy += (speed * speed - state.waterEnergy) * memory;
      }
      return state;
    },
  };
}
