import { moonPosition, WATER_HORIZON } from "./composition";
import {
  Direction, Moon, Point, Ridge, moonLight, ridgeHeight, screenMoon, screenToScene,
} from "./moon";

export type LightingState = {
  /** Geometric centre, used for stable projected geometry such as bridge shadows. */
  direction: Direction;
  /** Cloud/mountain-weighted centroid of the exposed source. */
  sourceDirection: Direction;
  tangentX: Direction;
  tangentY: Direction;
  /** Angular covariance in the source tangent basis: xx, xy, yy (radians squared). */
  covariance: readonly [number, number, number];
  angularRadius: number;
  /** Atmospheric transmission relative to the clear responsive default moon. */
  incidentIntensity: number;
  /** Incident intensity times the jointly transmitted fraction of the whole disc. */
  directIntensity: number;
  transmission: number;
  ambientGain: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const dot = (a: Direction, b: Direction) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (x: number, y: number, z: number): Direction => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

/** A finite spherical air column, even at the horizon; elevation is in radians. */
export function atmosphericTransmission(elevation: number) {
  const earthRadius = 6371, shellHeight = 8, verticalOpticalDepth = 0.10;
  const rise = earthRadius * Math.max(0, Math.sin(elevation));
  const shell = shellHeight * (2 * earthRadius + shellHeight);
  // Rationalized subtraction avoids cancellation for the short zenith column.
  const pathLength = shell / (Math.sqrt(rise * rise + shell) + rise);
  return Math.exp(-verticalOpticalDepth * pathLength / shellHeight);
}

/** Match the sky/cloud projection and the water camera for every exposed disc sample. */
export function sampleLighting(
  moon: Moon,
  ridges: readonly Ridge[],
  width: number,
  height: number,
  parallax: Point,
  transmission: (skyUv: Point) => number,
): LightingState {
  const direction = moonLight(moon, width, height, parallax).direction;
  const reference = moonLight(moonPosition(width, height), width, height, parallax).direction;
  const incidentIntensity = atmosphericTransmission(Math.asin(direction[1])) /
    atmosphericTransmission(Math.asin(reference[1]));
  const disc = screenMoon(moon, width, height, parallax);
  const radius = Math.max(disc.radius, 1e-8);
  // Equal-solid-angle radius of the projected disc. It broadens reflections but
  // never scales total light: the moon is distant, not a nearby luminous sphere.
  const angularRadius = Math.atan(Math.max(0, moon.radius) * Math.pow(direction[2], 1.5));
  const samples = new Float64Array(32 * 4 * 4);
  let sampleCount = 0, fullArea = 0, weight = 0;
  let sumX = 0, sumY = 0, sumZ = 0;
  for (let i = 0; i < 32; i++) {
    const offset = ((i + 0.5) / 32 * 2 - 1) * radius;
    const half = Math.sqrt(Math.max(0, radius * radius - offset * offset));
    const x = disc.x + offset;
    const top = disc.y - half;
    let bottom = disc.y + half;
    fullArea += 2 * half;
    for (const ridge of ridges) bottom = Math.min(bottom, ridgeHeight(x, ridge, width, height, parallax));
    const exposed = Math.max(0, bottom - top);
    if (!exposed) continue;
    for (let j = 0; j < 4; j++) {
      const point = { x, y: top + exposed * (j + 0.5) / 4 };
      const cloud = transmission(screenToScene(point, 0, width, height, parallax));
      const sampleWeight = exposed * 0.25 * (Number.isFinite(cloud) ? clamp01(cloud) : 0);
      if (!sampleWeight) continue;
      const uv = screenToScene(point, 3, width, height, parallax);
      const ray = normalize((uv.x - 0.5) * width / height, uv.y - WATER_HORIZON, 1);
      const index = sampleCount++ * 4;
      samples[index] = ray[0];
      samples[index + 1] = ray[1];
      samples[index + 2] = ray[2];
      samples[index + 3] = sampleWeight;
      weight += sampleWeight;
      sumX += ray[0] * sampleWeight;
      sumY += ray[1] * sampleWeight;
      sumZ += ray[2] * sampleWeight;
    }
  }
  const sourceDirection = weight > 0 ? normalize(sumX, sumY, sumZ) : direction;
  const tangentX = normalize(sourceDirection[2], 0, -sourceDirection[0]);
  const tangentY = normalize(
    sourceDirection[1] * tangentX[2],
    sourceDirection[2] * tangentX[0] - sourceDirection[0] * tangentX[2],
    -sourceDirection[1] * tangentX[0],
  );
  let xx = 0, xy = 0, yy = 0, meanX = 0, meanY = 0;
  for (let i = 0; i < sampleCount; i++) {
    const index = i * 4;
    const ray: Direction = [samples[index], samples[index + 1], samples[index + 2]];
    const sampleWeight = samples[index + 3] / weight;
    const forward = dot(ray, sourceDirection);
    const x = Math.atan2(dot(ray, tangentX), forward);
    const y = Math.atan2(dot(ray, tangentY), forward);
    meanX += sampleWeight * x;
    meanY += sampleWeight * y;
    xx += sampleWeight * x * x;
    xy += sampleWeight * x * y;
    yy += sampleWeight * y * y;
  }
  xx = Math.max(0, xx - meanX * meanX);
  yy = Math.max(0, yy - meanY * meanY);
  xy -= meanX * meanY;
  const xyLimit = Math.sqrt(xx * yy);
  const jointTransmission = clamp01(weight / fullArea);
  const directIntensity = incidentIntensity * jointTransmission;
  const elevationGain = clamp01(direction[1] / Math.max(reference[1], 1e-6));
  const ambientInput = clamp01(directIntensity * (0.75 + 0.25 * elevationGain));
  const ambientGain = 0.88 + 0.12 * ambientInput * ambientInput * (3 - 2 * ambientInput);
  return {
    direction,
    sourceDirection,
    tangentX,
    tangentY,
    covariance: [xx, Math.max(-xyLimit, Math.min(xyLimit, xy)), yy],
    angularRadius,
    incidentIntensity,
    directIntensity,
    transmission: jointTransmission,
    ambientGain,
  };
}

export const srgbToLinear = (value: number) => value <= 0.04045
  ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
export const linearToSrgb = (value: number) => value <= 0.0031308
  ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

/**
 * Preserve the authored reference moon while transporting its contrast through
 * the atmosphere. Sky radiance already includes in-scattered airlight; extinction
 * fades the moon toward that sky, not black. Keep sprite/halo alpha unchanged and
 * apply cloud coverage in the later cloud pass, never in this incident intensity.
 */
export function moonRadiance(
  authoredLinear: number,
  currentSky: number,
  referenceSky: number,
  incidentIntensity: number,
) {
  return Math.max(0, currentSky + incidentIntensity * (authoredLinear - referenceSky));
}

/** Matching linear-light display transport for the lunar disc and its halo. */
export const moonRadianceGLSL = /* glsl */`
vec3 moonRadiance(vec3 authoredLinear, vec3 currentSky, vec3 referenceSky, float incidentIntensity) {
  return max(vec3(0.0), currentSky + incidentIntensity * (authoredLinear - referenceSky));
}
`;

/** Textures retain their authored sRGB tones; illumination is evaluated in linear light. */
export const colorGLSL = /* glsl */`
vec3 srgbToLinear(vec3 value) {
  return mix(value / 12.92, pow(max((value + 0.055) / 1.055, vec3(0.0)), vec3(2.4)),
    step(vec3(0.04045), value));
}
vec3 linearToSrgb(vec3 value) {
  return mix(value * 12.92, 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), value));
}
`;

/** Camera-space normals: +X right, +Y up, +Z away from the viewer. */
export function normalColor(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z) || 1;
  return `rgb(${[x, y, z]
    .map((component) => Math.round((component / length * 0.5 + 0.5) * 255))
    .join(",")})`;
}

export function lightResponse(
  x: number,
  y: number,
  z: number,
  direction: readonly number[],
  twoSided = false,
) {
  const dot = x * direction[0] + y * direction[1] + z * direction[2];
  // Leaves transmit a little light from either side; masonry does not.
  return Math.max(0, dot) + (twoSided ? 0.3 * Math.max(0, -dot) : 0);
}

/** Preserve the original painting under the reference moon, retaining ambient light. */
export function lightingGain(
  response: number,
  referenceResponse: number,
  visibility: number,
  strength: number,
  ambientGain = 1,
) {
  const ambient = 1 - strength;
  return (ambient * ambientGain + strength * visibility * response) /
    (ambient + strength * referenceResponse);
}
