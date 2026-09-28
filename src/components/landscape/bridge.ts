import { createBridgeGeometry } from "./bridgeGeometry";
import { moonPosition, WATER_HORIZON } from "./composition";

type Point = { x: number; y: number };
type Vertex = [number, number, number];
type Random = () => number;

/** A quiet cast shadow on the river, separate from the mirrored stonework. */
export function paintBridgeWaterShadow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const g = createBridgeGeometry(w, h);
  const moon = moonPosition(w, h);
  // Use the same camera-space moon ray as the water shader, rotated into the
  // bridge's local axes. Intersect rays from the masonry with world y = 0.
  const lightX = (moon.x - 0.5) * (w / h);
  const lightY = moon.y - WATER_HORIZON;
  const along = (lightX * g.cosAngle + g.sinAngle) / lightY;
  const across = (g.cosAngle - lightX * g.sinAngle) / lightY;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const mask = canvas.getContext("2d");
  if (!mask) return;
  let minY = Infinity,
    maxY = -Infinity;
  const silhouette = (vertices: Vertex[]) => {
    mask.beginPath();
    vertices.forEach(([u, y, v], i) => {
      const p = g.project(u - y * along, 0, v - y * across);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      if (i) mask.lineTo(p.x, p.y);
      else mask.moveTo(p.x, p.y);
    });
    mask.closePath();
    mask.fill();
  };
  // Opaque silhouettes form a union first, avoiding dark seams where faces meet.
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
    silhouette(face);
  }
  const deck: Vertex[] = [],
    barrel: Vertex[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 64; i++) {
      const t = side < 0 ? i / 64 : 1 - i / 64;
      const u = -g.halfLength + 2 * g.halfLength * t;
      const a = g.archPoint(t);
      deck.push([u, g.deckHeight(u), side * g.halfWidth]);
      barrel.push([a.u, a.y, side * g.halfWidth]);
    }
  }
  silhouette(deck);
  silhouette(barrel);
  mask.globalCompositeOperation = "source-in";
  const wash = mask.createLinearGradient(0, minY, 0, maxY + g.scale * 0.25);
  wash.addColorStop(0, "rgba(32,62,77,.09)");
  wash.addColorStop(0.3, "rgba(32,62,77,.12)");
  wash.addColorStop(1, "rgba(32,62,77,0)");
  mask.fillStyle = wash;
  mask.fillRect(0, 0, w, h);
  // Share the reflection's water distortion and depth, with no extra GPU layer.
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.filter = `blur(${Math.max(1, g.scale * 0.12)}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/** Project solid construction first, then describe it with a few mineral washes. */
export function paintBridge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  random: Random,
  reflected = false,
) {
  const g = createBridgeGeometry(w, h);
  const L = g.halfLength,
    V = g.halfWidth,
    s = g.scale;
  const p = (u: number, y: number, v: number) => g.project(u, y, v, reflected);
  const path = (points: Point[], close = true) => {
    ctx.beginPath();
    points.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
    if (close) ctx.closePath();
  };
  const polygon = (vertices: Vertex[], color: string) => {
    path(vertices.map(([u, y, v]) => p(u, y, v)));
    ctx.fillStyle = color;
    ctx.fill();
  };
  const line = (points: Point[], color: string, width: number) => {
    path(points, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const face = (v: number) => {
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
    path(points);
  };
  const masonry = (v: number, back: boolean) => {
    ctx.save();
    face(v);
    ctx.clip();
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
    polygon(wall, near ? "#839d9c" : "#6c8b90");
    polygon(top, "#9aada4");
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
      );
      polygon(
        [
          [u - r, cap, v],
          [u + r, cap, v],
          [u + r, cap, outside],
          [u - r, cap, outside],
        ],
        "#9aada4",
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
      );
      polygon(
        [
          [b, y, -V],
          [b, nextY, -V],
          [b, nextY, V],
          [b, y, V],
        ],
        "#779497",
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
  );
  masonry(-V, false);
  parapet(-V, true);
}
