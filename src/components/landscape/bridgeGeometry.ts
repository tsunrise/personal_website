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
