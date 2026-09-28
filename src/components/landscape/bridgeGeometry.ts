import { EYE_HEIGHT, WATER_HORIZON } from "./composition";

/** Local masonry proportions, uniformly scaled into the river's world camera. */
export function createBridgeGeometry(width: number, height: number) {
  const portrait = width / height < 0.85;
  const initialScale = portrait ? 0.52 : 0.65;
  const halfLength = 3.65;
  const halfWidth = 0.56;
  const archHalfSpan = 2.65;
  const springHeight = 0.18;
  const archRise = 1.22;
  const ringThickness = 0.3;
  const crownHeight = 2;
  const endHeight = 0.62;
  const sinAngle = 0.14;
  const cosAngle = Math.sqrt(1 - sinAngle * sinAngle);

  // A circular segment gives the arch ring radial joints and uniform thickness.
  const archRadius =
    (archHalfSpan * archHalfSpan + archRise * archRise) / (2 * archRise);
  const archCenterY = springHeight + archRise - archRadius;
  const archAngle = Math.asin(archHalfSpan / archRadius);

  const targetCenter = portrait ? 0.92 : 0.78;
  // Portrait keeps a naturally proportioned foreground bridge and crops its
  // far approach instead of shrinking the entire structure toward the horizon.
  const targetSpan = portrait
    ? Math.max(width * 0.65, height * 0.35)
    : width * 0.34;
  const centerRay = ((targetCenter - 0.5) * width) / height;
  // Solve the projected endpoint separation, including the slight depth skew.
  const worldHalfLength = halfLength * initialScale;
  const distanceTerm =
    (worldHalfLength * height * (cosAngle - centerRay * sinAngle)) / targetSpan;
  const initialDistance = Math.max(
    6.4,
    distanceTerm +
      Math.sqrt(
        distanceTerm * distanceTerm + (worldHalfLength * sinAngle) ** 2,
      ),
  );
  // Retain 62.5% of the portrait approach height above the viewport bottom.
  // Scale the model and camera distance together to retain its apparent size;
  // shared projection keeps the bank contacts and water reflection attached.
  const approachDepth =
    initialDistance +
    ((-halfLength - 0.03) * sinAngle + halfWidth * cosAngle) * initialScale;
  const approachY =
    1 - WATER_HORIZON + (EYE_HEIGHT - endHeight * initialScale) / approachDepth;
  const lowerBy = portrait ? Math.max(0, 1 - approachY) * 0.375 : 0;
  const placementScale = EYE_HEIGHT / (EYE_HEIGHT + lowerBy * approachDepth);
  const modelScale = initialScale * placementScale;
  const cz = initialDistance * placementScale;
  const cx = centerRay * cz;

  function project(u: number, y: number, v = 0, reflected = false) {
    const worldX = cx + (u * cosAngle - v * sinAngle) * modelScale;
    const worldZ = cz + (u * sinAngle + v * cosAngle) * modelScale;
    const worldY = (reflected ? -y : y) * modelScale;
    return {
      x: width * 0.5 + (height * worldX) / worldZ,
      y:
        height * (1 - WATER_HORIZON) +
        (height * (EYE_HEIGHT - worldY)) / worldZ,
    };
  }

  function archPoint(t: number, offset = 0) {
    const angle = (t * 2 - 1) * archAngle;
    const radius = archRadius + offset;
    return {
      u: radius * Math.sin(angle),
      y: archCenterY + radius * Math.cos(angle),
    };
  }

  function deckHeight(u: number) {
    const position = Math.min(1, Math.abs(u) / halfLength);
    return crownHeight - (crownHeight - endHeight) * position * position;
  }

  return {
    project,
    archPoint,
    deckHeight,
    portrait,
    modelScale,
    halfLength,
    halfWidth,
    archHalfSpan,
    springHeight,
    archRise,
    ringThickness,
    crownHeight,
    endHeight,
    archRadius,
    archCenterY,
    archAngle,
    sinAngle,
    cosAngle,
    cx,
    cz,
    scale: (height * modelScale) / cz,
  };
}

export type BridgeGeometry = ReturnType<typeof createBridgeGeometry>;

export type BridgeVertex = readonly [number, number, number];

/** Rotate a local construction normal into the water camera's world axes. */
export function bridgeNormal(g: BridgeGeometry, u: number, y: number, v: number) {
  const length = Math.hypot(u, y, v) || 1;
  return [
    (u * g.cosAngle - v * g.sinAngle) / length,
    y / length,
    (u * g.sinAngle + v * g.cosAngle) / length,
  ] as const;
}

/**
 * Cast masonry onto water, clipping in camera space before perspective division.
 * A low moon can put a shadow behind the eye; projecting those vertices first
 * would turn it into an enormous, inverted polygon across the river.
 */
export function projectBridgeShadowPolygon(
  g: BridgeGeometry,
  vertices: readonly BridgeVertex[],
  direction: readonly number[],
  width: number,
  height: number,
) {
  if (
    direction.length < 3 ||
    !direction.every(Number.isFinite) ||
    direction[1] <= 1e-6
  ) return [];
  type GroundPoint = { x: number; z: number };
  let points: GroundPoint[] = vertices.map(([u, y, v]) => {
    const worldY = y * g.modelScale;
    return {
      x: g.cx + (u * g.cosAngle - v * g.sinAngle) * g.modelScale -
        (worldY * direction[0]) / direction[1],
      z: g.cz + (u * g.sinAngle + v * g.cosAngle) * g.modelScale -
        (worldY * direction[2]) / direction[1],
    };
  });
  const clip = (distance: (point: GroundPoint) => number) => {
    const input = points;
    points = [];
    if (!input.length) return;
    let previous = input[input.length - 1];
    let previousDistance = distance(previous);
    for (const point of input) {
      const currentDistance = distance(point);
      if ((currentDistance >= 0) !== (previousDistance >= 0)) {
        const t = previousDistance / (previousDistance - currentDistance);
        points.push({
          x: previous.x + (point.x - previous.x) * t,
          z: previous.z + (point.z - previous.z) * t,
        });
      }
      if (currentDistance >= 0) points.push(point);
      previous = point;
      previousDistance = currentDistance;
    }
  };
  clip(({ z }) => z - 1e-4);
  const halfView = width / (2 * height);
  clip(({ x, z }) => x + halfView * z);
  clip(({ x, z }) => halfView * z - x);
  clip(({ z }) => WATER_HORIZON * z - EYE_HEIGHT);
  return points.map(({ x, z }) => ({
    x: Math.max(0, Math.min(width, width * 0.5 + (height * x) / z)),
    y: Math.max(0, Math.min(height,
      height * (1 - WATER_HORIZON) + (height * EYE_HEIGHT) / z)),
  }));
}
