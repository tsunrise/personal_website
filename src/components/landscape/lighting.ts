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
  return twoSided ? 0.25 + 0.75 * Math.abs(dot) : Math.max(0, dot);
}

/** Preserve the original painting under the reference moon, retaining ambient light. */
export function lightingGain(
  response: number,
  referenceResponse: number,
  visibility: number,
  strength: number,
) {
  const ambient = 1 - strength;
  return (ambient + strength * visibility * response) /
    (ambient + strength * referenceResponse);
}
