import {
  bridgeNormal,
  BridgeGeometry,
  createBridgeGeometry,
  projectBridgeShadowPolygon,
} from "./bridgeGeometry";
import { moonPosition, WATER_HORIZON } from "./composition";
import { normalColor } from "./lighting";

type Point = { x: number; y: number };
type Vertex = [number, number, number];
type Random = () => number;

// One reusable mask and set of construction silhouettes per output texture.
// Weak ownership lets resize/unmount release these with the river painting.
const shadowScratch = new WeakMap<CanvasRenderingContext2D, {
  canvas: HTMLCanvasElement;
  mask: CanvasRenderingContext2D;
  geometry: BridgeGeometry;
  faces: Vertex[][];
}>();

function makeShadowFaces(g: BridgeGeometry) {
  const faces: Vertex[][] = [];
  for (const v of [-g.halfWidth, g.halfWidth]) {
    const face: Vertex[] = [];
    for (let i = 0; i <= 64; i++) {
      const u = -g.halfLength + (2 * g.halfLength * i) / 64;
      face.push([u, g.deckHeight(u) + 0.23, v]);
    }
    face.push([g.halfLength, 0, v], [g.archHalfSpan, 0, v]);
    for (let i = 64; i >= 0; i--) {
      const a = g.archPoint(i / 64);
      face.push([a.u, a.y, v]);
    }
    face.push([-g.archHalfSpan, 0, v], [-g.halfLength, 0, v]);
    faces.push(face);
  }
  const deck: Vertex[] = [], barrel: Vertex[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 64; i++) {
      const t = side < 0 ? i / 64 : 1 - i / 64;
      const u = -g.halfLength + 2 * g.halfLength * t;
      const a = g.archPoint(t);
      deck.push([u, g.deckHeight(u), side * g.halfWidth]);
      barrel.push([a.u, a.y, side * g.halfWidth]);
    }
  }
  faces.push(deck, barrel);
  return faces;
}

/** A soft light-occlusion mask for shading the river beneath the bridge. */
export function paintBridgeWaterShadow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  direction?: readonly number[],
) {
  ctx.clearRect(0, 0, w, h);
  let scratch = shadowScratch.get(ctx);
  if (!scratch || scratch.canvas.width !== w || scratch.canvas.height !== h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const mask = canvas.getContext("2d");
    if (!mask) return;
    const geometry = createBridgeGeometry(w, h);
    scratch = { canvas, mask, geometry, faces: makeShadowFaces(geometry) };
    shadowScratch.set(ctx, scratch);
  }
  const { canvas, mask, geometry: g, faces } = scratch;
  const moon = moonPosition(w, h);
  const light = direction || [(moon.x - 0.5) * (w / h), moon.y - WATER_HORIZON, 1];
  mask.clearRect(0, 0, w, h);
  mask.globalCompositeOperation = "source-over";
  mask.fillStyle = "#000";
  let minY = Infinity,
    maxY = -Infinity;
  const silhouette = (vertices: Vertex[]) => {
    const points = projectBridgeShadowPolygon(g, vertices, light, w, h);
    if (points.length < 3) return;
    mask.beginPath();
    points.forEach((p, i) => {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      if (i) mask.lineTo(p.x, p.y);
      else mask.moveTo(p.x, p.y);
    });
    mask.closePath();
    mask.fill();
  };
  // Opaque silhouettes form a union first, avoiding dark seams where faces meet.
  faces.forEach(silhouette);
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;
  mask.globalCompositeOperation = "source-in";
  const wash = mask.createLinearGradient(0, minY, 0, maxY + g.scale * 0.25);
  wash.addColorStop(0, "rgba(0,0,0,.65)");
  wash.addColorStop(0.3, "rgba(0,0,0,.8)");
  wash.addColorStop(1, "rgba(0,0,0,0)");
  mask.fillStyle = wash;
  mask.fillRect(0, 0, w, h);
  // A broad penumbra keeps the lighting diffuse in the hazy, painted scene.
  ctx.save();
  ctx.filter = `blur(${Math.max(2, g.scale * 0.4)}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/** Project solid construction first, then describe it with a few mineral washes. */
export function paintBridge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  random: Random,
  normalCtx?: CanvasRenderingContext2D,
) {
  const g = createBridgeGeometry(w, h);
  const L = g.halfLength,
    V = g.halfWidth,
    s = g.scale;
  const p = (u: number, y: number, v: number) => g.project(u, y, v);
  const path = (points: Point[], close = true, target = ctx) => {
    target.beginPath();
    points.forEach((a, i) => (i ? target.lineTo(a.x, a.y) : target.moveTo(a.x, a.y)));
    if (close) target.closePath();
  };
  const normalPolygon = (vertices: Vertex[], normal: Vertex) => {
    if (!normalCtx) return;
    path(vertices.map(([u, y, v]) => p(u, y, v)), true, normalCtx);
    normalCtx.fillStyle = normalColor(...bridgeNormal(g, ...normal));
    normalCtx.fill();
  };
  const polygon = (vertices: Vertex[], color: string, normal?: Vertex) => {
    path(vertices.map(([u, y, v]) => p(u, y, v)));
    ctx.fillStyle = color;
    ctx.fill();
    if (normal) normalPolygon(vertices, normal);
  };
  const line = (points: Point[], color: string, width: number) => {
    path(points, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const face = (v: number, target = ctx) => {
    const points: Point[] = [];
    for (let i = 0; i <= 80; i++) {
      const u = -L + (2 * L * i) / 80;
      points.push(p(u, g.deckHeight(u), v));
    }
    points.push(p(L, 0, v), p(g.archHalfSpan, 0, v));
    for (let i = 80; i >= 0; i--) {
      const a = g.archPoint(i / 80);
      points.push(p(a.u, a.y, v));
    }
    points.push(p(-g.archHalfSpan, 0, v), p(-L, 0, v));
    path(points, true, target);
  };
  const masonry = (v: number, back: boolean) => {
    ctx.save();
    face(v);
    ctx.clip();
    if (normalCtx) {
      face(v, normalCtx);
      normalCtx.fillStyle = normalColor(...bridgeNormal(g, 0, 0, back ? 1 : -1));
      normalCtx.fill();
    }
    // Tonal masses, like the mountain washes: no tiled masonry grid or bevels.
    ctx.fillStyle = back ? "#6d898d" : "#7b9697";
    ctx.fillRect(0, 0, w, h);
    const top = p(0, 2.05, v),
      bottom = p(0, 0, v);
    const mineral = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
    mineral.addColorStop(0, "rgba(174,186,168,.15)");
    mineral.addColorStop(0.5, "rgba(121,151,151,0)");
    mineral.addColorStop(1, "rgba(47,86,103,.33)");
    ctx.fillStyle = mineral;
    ctx.fillRect(0, 0, w, h);
    // Broad, uneven tide staining follows the foot rather than outlining blocks.
    const tide: Vertex[] = [
      [-L, 0, v],
      [L, 0, v],
    ];
    for (let i = 24; i >= 0; i--) {
      const u = -L + (2 * L * i) / 24;
      tide.push([
        u,
        0.19 + 0.065 * Math.sin(u * 3.1) + 0.022 * Math.sin(u * 9),
        v,
      ]);
    }
    polygon(tide, "rgba(53,87,96,.14)");
    // Sparse dry-brush fibres echo the mountain strata at the same screen scale.
    for (let i = 0; i < 420; i++) {
      const u = (random() * 2 - 1) * L,
        y = random() * 2.2;
      const a = p(u, y, v),
        b = p(u - 0.025 - random() * 0.07, y - 0.07 - random() * 0.22, v);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(
        a.x - s * 0.02,
        a.y - s * 0.03,
        b.x + s * 0.025,
        b.y + s * 0.03,
        b.x,
        b.y,
      );
      ctx.strokeStyle = `rgba(${i % 3 ? "192,199,178" : "49,84,94"},${0.03 + random() * 0.065})`;
      ctx.lineWidth = s * (0.004 + random() * 0.012);
      ctx.stroke();
    }
    // Suggest a few courses at the haunches, leaving most stone undescribed.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = 0.31 + i * 0.29,
          u = side * (3.47 - i * 0.27);
        line(
          [p(u, y, v), p(u - side * (0.22 + random() * 0.26), y + 0.006, v)],
          "rgba(50,83,94,.18)",
          s * 0.008,
        );
      }
    }
    ctx.restore();
    // A single ribbon of lighter stone follows the exact structural arch.
    const ring: Vertex[] = [];
    for (let i = 0; i <= 80; i++) {
      const a = g.archPoint(i / 80, g.ringThickness);
      ring.push([a.u, a.y, v]);
    }
    for (let i = 80; i >= 0; i--) {
      const a = g.archPoint(i / 80);
      ring.push([a.u, a.y, v]);
    }
    polygon(ring, back ? "#799496" : "#8ba3a0");
    // A handful of partial radial brush marks imply voussoirs, not a block inventory.
    for (const t of [0.065, 0.19, 0.34, 0.49, 0.65, 0.81, 0.94]) {
      const a = g.archPoint(t, 0.035),
        b = g.archPoint(t, 0.22);
      line([p(a.u, a.y, v), p(b.u, b.y, v)], "rgba(53,87,98,.24)", s * 0.009);
    }
    const edge: Point[] = [];
    for (let i = 0; i <= 80; i++) {
      const a = g.archPoint(i / 80, 0.01);
      edge.push(p(a.u, a.y, v));
    }
    line(edge, "rgba(47,83,95,.20)", s * 0.011);
    // Wide, faint mineral blooms cross the ring as well as the wall, like ink
    // settling into paper. They never displace the common structural silhouette.
    ctx.save();
    face(v);
    ctx.clip();
    for (let i = 0; i < 12; i++) {
      const u = -L + ((i + random() * 0.6) * 2 * L) / 12;
      const y = 0.22 + random() * 1.65;
      const rx = 0.2 + random() * 0.45,
        ry = 0.08 + random() * 0.16;
      polygon(
        [
          [u - rx, y, v],
          [u - rx * 0.48, y + ry * 0.65, v],
          [u + rx * 0.16, y + ry, v],
          [u + rx, y + ry * 0.2, v],
          [u + rx * 0.64, y - ry * 0.43, v],
          [u - rx * 0.28, y - ry, v],
        ],
        `rgba(${i % 3 ? "55,91,105" : "183,196,172"},${0.025 + random() * 0.035})`,
      );
    }
    ctx.restore();
    for (const side of [-1, 1]) {
      polygon(
        [
          [side * 2.65, 0, v],
          [side * 3.04, 0, v],
          [side * 3.04, 0.34, v],
          [side * 2.65, 0.18, v],
        ],
        "#6b8a8f",
      );
    }
  };
  const parapet = (v: number, near: boolean) => {
    const outside = v + (near ? -0.16 : 0.16),
      height = 0.23;
    const wall: Vertex[] = [],
      top: Vertex[] = [];
    for (let i = 0; i <= 80; i++) {
      const u = -L + (2 * L * i) / 80;
      wall.push([u, g.deckHeight(u), near ? outside : v]);
      top.push([u, g.deckHeight(u) + height, v]);
    }
    for (let i = 80; i >= 0; i--) {
      const u = -L + (2 * L * i) / 80;
      wall.push([u, g.deckHeight(u) + height, near ? outside : v]);
      top.push([u, g.deckHeight(u) + height, outside]);
    }
    polygon(wall, near ? "#839d9c" : "#6c8b90", [0, 0, near ? -1 : 1]);
    polygon(top, "#9aada4");
    // Coping follows the curved deck; its slope changes continuously over the arch.
    for (let i = 0; i < 80; i++) {
      const a = -L + (2 * L * i) / 80;
      const b = -L + (2 * L * (i + 1)) / 80;
      const slope = -((g.crownHeight - g.endHeight) * (a + b)) / (L * L);
      normalPolygon([
        [a, g.deckHeight(a) + height, v],
        [b, g.deckHeight(b) + height, v],
        [b, g.deckHeight(b) + height, outside],
        [a, g.deckHeight(a) + height, outside],
      ], [-slope, 1, 0]);
    }
    // A quiet calligraphic highlight describes the whole curve.
    const contour: Point[] = [];
    for (let i = 0; i <= 100; i++) {
      const u = -L + (2 * L * i) / 100;
      contour.push(
        p(u, g.deckHeight(u) + height + 0.003 * Math.sin(i * 1.7), outside),
      );
    }
    for (const [start, end] of [
      [1, 18],
      [26, 52],
      [61, 84],
      [93, 100],
    ]) {
      line(contour.slice(start, end + 1), "rgba(194,203,181,.20)", s * 0.011);
    }
    // Only the terminal stones rise above the parapet; keep the crest unbroken.
    for (const u of [-L, L]) {
      const y = g.deckHeight(u),
        r = 0.092,
        cap = y + 0.3;
      polygon(
        [
          [u - r, y - 0.03, outside],
          [u + r, y - 0.03, outside],
          [u + r, cap, outside],
          [u - r, cap, outside],
        ],
        near ? "#8aa2a0" : "#779397",
        [0, 0, near ? -1 : 1],
      );
      polygon(
        [
          [u - r, cap, v],
          [u + r, cap, v],
          [u + r, cap, outside],
          [u - r, cap, outside],
        ],
        "#9aada4",
        [0, 1, 0],
      );
    }
  };
  masonry(V, true);
  // The vault is one calm shadow plane, not 46 individually outlined facets.
  const barrel: Vertex[] = [];
  for (let i = 0; i <= 80; i++) {
    const a = g.archPoint(i / 80);
    barrel.push([a.u, a.y, -V]);
  }
  for (let i = 80; i >= 0; i--) {
    const a = g.archPoint(i / 80);
    barrel.push([a.u, a.y, V]);
  }
  polygon(barrel, "#527783");
  // The underside is a circular vault even though the artwork is a single wash.
  for (let i = 0; i < 80; i++) {
    const a = g.archPoint(i / 80), b = g.archPoint((i + 1) / 80);
    const angle = (((i + 0.5) / 80) * 2 - 1) * g.archAngle;
    normalPolygon([
      [a.u, a.y, -V], [b.u, b.y, -V],
      [b.u, b.y, V], [a.u, a.y, V],
    ], [-Math.sin(angle), -Math.cos(angle), 0]);
  }
  parapet(V, false);
  const steps = 5,
    landing = 0.9;
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const y = g.endHeight + ((g.crownHeight - g.endHeight) * i) / steps;
      const nextY =
        g.endHeight + ((g.crownHeight - g.endHeight) * (i + 1)) / steps;
      const u =
        side * Math.sqrt(L * L - ((L * L - landing * landing) * i) / steps);
      const b =
        side *
        Math.sqrt(L * L - ((L * L - landing * landing) * (i + 1)) / steps);
      polygon(
        [
          [u, y, -V],
          [b, y, -V],
          [b, y, V],
          [u, y, V],
        ],
        "#91a8a3",
        [0, 1, 0],
      );
      polygon(
        [
          [b, y, -V],
          [b, nextY, -V],
          [b, nextY, V],
          [b, y, V],
        ],
        "#779497",
        [side, 0, 0],
      );
    }
  }
  polygon(
    [
      [-landing, g.crownHeight, -V],
      [landing, g.crownHeight, -V],
      [landing, g.crownHeight, V],
      [-landing, g.crownHeight, V],
    ],
    "#91a8a3",
    [0, 1, 0],
  );
  masonry(-V, false);
  parapet(-V, true);
}
