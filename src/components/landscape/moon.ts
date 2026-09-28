import { moonPosition, WATER_HORIZON } from "./composition";

export const OVERSCAN = 1.055;
export const MOON_DEPTH = 2;
export const RESET_SECONDS = 0.65;
export type Point = { x: number; y: number };
export type Moon = ReturnType<typeof moonPosition>;
export type Ridge = { points: readonly Point[]; depth: number };
export type Direction = readonly [number, number, number];
const center: Point = { x: 0, y: 0 };

/** Artwork UVs point upward; browser coordinates point downward. */
export function sceneToScreen(
  uv: Point, depth: number, width: number, height: number, parallax = center,
): Point {
  return {
    x: (0.5 + (uv.x - 0.5) * OVERSCAN) * width + parallax.x * depth,
    y: (0.5 - (uv.y - 0.5) * OVERSCAN) * height + parallax.y * depth,
  };
}

export function screenToScene(
  point: Point, depth: number, width: number, height: number, parallax = center,
): Point {
  return {
    x: 0.5 + ((point.x - parallax.x * depth) / width - 0.5) / OVERSCAN,
    y: 0.5 - ((point.y - parallax.y * depth) / height - 0.5) / OVERSCAN,
  };
}

export function screenMoon(moon: Moon, width: number, height: number, parallax = center) {
  return {
    ...sceneToScreen(moon, MOON_DEPTH, width, height, parallax),
    radius: moon.radius * height * OVERSCAN,
  };
}

export function clampMoon(moon: Moon, width: number, height: number, parallax = center): Moon {
  const visible = screenMoon(moon, width, height, parallax);
  const horizon = Math.max(0.0001, Math.min(height,
    sceneToScreen({ x: 0.5, y: WATER_HORIZON }, 3, width, height, parallax).y));
  const r = Math.min(visible.radius, width / 2, horizon / 2);
  const point = screenToScene({
    x: Math.max(r, Math.min(width - r, visible.x)),
    y: Math.max(r, Math.min(horizon - r, visible.y)),
  }, MOON_DEPTH, width, height, parallax);
  return { ...point, radius: r / (height * OVERSCAN) };
}

/** The water camera is the common world-space reference for every light receiver. */
export function moonLight(moon: Moon, width: number, height: number, parallax = center) {
  const screen = screenMoon(moon, width, height, parallax);
  const uv = screenToScene(screen, 3, width, height, parallax);
  const x = (uv.x - 0.5) * width / height;
  const y = uv.y - WATER_HORIZON;
  const length = Math.hypot(x, y, 1);
  return {
    moon: { ...uv, radius: moon.radius },
    direction: [x / length, y / length, 1 / length] as Direction,
  };
}

function ridgeHeight(x: number, ridge: Ridge, width: number, height: number, parallax: Point) {
  const uv = screenToScene({ x, y: 0 }, ridge.depth, width, height, parallax);
  const points = ridge.points;
  if (points.length < 2 || uv.x < points[0].x || uv.x > points[points.length - 1].x) return Infinity;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < uv.x) lo = mid;
    else hi = mid;
  }
  const a = points[lo], b = points[hi];
  const t = (uv.x - a.x) / Math.max(b.x - a.x, 1e-9);
  return sceneToScreen({ x: uv.x, y: a.y + (b.y - a.y) * t }, ridge.depth, width, height, parallax).y;
}

/** Integrate disc chords against the union of the exact painted ridge polylines. */
export function mountainCoverage(moon: Moon, ridges: readonly Ridge[], width: number, height: number, parallax = center) {
  if (!ridges.length) return 0;
  const disc = screenMoon(moon, width, height, parallax);
  let covered = 0, area = 0;
  const strips = 256;
  for (let i = 0; i < strips; i++) {
    const offset = ((i + 0.5) / strips * 2 - 1) * disc.radius;
    const half = Math.sqrt(Math.max(0, disc.radius ** 2 - offset ** 2));
    let ridge = Infinity;
    for (const band of ridges) ridge = Math.min(ridge, ridgeHeight(disc.x + offset, band, width, height, parallax));
    area += 2 * half;
    covered += Math.max(0, Math.min(2 * half, disc.y + half - ridge));
  }
  return area ? covered / area : 0;
}

export const canResetMoon = (coverage: number) => coverage > 0.9;

export function interpolateMoon(from: Moon, to: Moon, seconds: number): Moon {
  const t = Math.max(0, Math.min(1, seconds / RESET_SECONDS));
  const eased = t * t * (3 - 2 * t);
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    radius: to.radius,
  };
}

export function paintMountainMask(ctx: CanvasRenderingContext2D, ridges: readonly Ridge[], width: number, height: number, parallax = center) {
  const canvas = ctx.canvas;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "black";
  for (const ridge of ridges) {
    if (!ridge.points.length) continue;
    ctx.beginPath();
    ridge.points.forEach((uv, i) => {
      const p = sceneToScreen(uv, ridge.depth, width, height, parallax);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    const first = sceneToScreen(ridge.points[0], ridge.depth, width, height, parallax);
    const last = sceneToScreen(ridge.points[ridge.points.length - 1], ridge.depth, width, height, parallax);
    ctx.lineTo(last.x, height + 16);
    ctx.lineTo(first.x, height + 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.resetTransform();
}
