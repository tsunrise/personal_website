import { createBridgeGeometry } from "./bridgeGeometry";

type Point = { x: number; y: number };
type Random = () => number;

/** Quiet earth washes: one continuous foreground shore and a receding far headland. */
export function paintBanks(
  ctx: CanvasRenderingContext2D,
  contact: CanvasRenderingContext2D,
  w: number,
  h: number,
  random: Random,
) {
  const g = createBridgeGeometry(w, h);
  const s = g.scale;
  const landing = g.project(-g.halfLength, g.endHeight, -g.halfWidth);
  const back = g.project(-g.halfLength - 0.03, g.endHeight, g.halfWidth);
  const heel = g.project(-g.halfLength, 0, -g.halfWidth);
  const toe = g.project(-g.archHalfSpan - 0.13, 0, -g.halfWidth);
  const far = g.project(g.halfLength, g.endHeight, -g.halfWidth);
  const farToe = g.project(g.archHalfSpan + 0.13, 0, -g.halfWidth);
  const point = (x: number, y: number): Point => ({ x, y });
  const uv = (x: number, y: number) => point(x * w, y * h);

  // The near shore opens into the lower-right foreground; its inlet meets the
  // open river at left rather than forming two parallel canals.
  // Each end follows the same projected landing and springing as the bridge.
  const near: Point[] = [];
  const farShore: Point[] = [];
  const foreground: Point[] = [];
  const curve = (out: Point[], a: Point, b: Point, c: Point, d: Point) => {
    const steps = Math.max(12, Math.ceil(Math.hypot(d.x - a.x, d.y - a.y) / 5));
    for (let i = out.length ? 1 : 0; i <= steps; i++) {
      const t = i / steps,
        q = 1 - t;
      // Tiny irregularities give the waterline the same hand-drawn edge as the hills.
      const rough = Math.sin(t * Math.PI) * (random() - 0.5) * s * 0.026;
      out.push(
        point(
          q ** 3 * a.x +
            3 * q * q * t * b.x +
            3 * q * t * t * c.x +
            t ** 3 * d.x,
          q ** 3 * a.y +
            3 * q * q * t * b.y +
            3 * q * t * t * c.y +
            t ** 3 * d.y +
            rough,
        ),
      );
    }
  };
  curve(
    foreground,
    uv(-0.04, 0.953),
    uv(0.075, 0.945),
    uv(0.15, 0.995),
    uv(0.3, 1.04),
  );
  // A wider portrait foot and shoulder avoid a tall, pinched bank on phones.
  const shoulder = point(
    back.x - s * (g.portrait ? 0.62 : 0.46),
    back.y + s * 0.055,
  );
  curve(
    near,
    uv(g.portrait ? 0.18 : 0.42, 1.055),
    uv(g.portrait ? 0.22 : 0.5, 1.005),
    point(
      back.x - s * (g.portrait ? 1.2 : 0.95),
      back.y + s * (g.portrait ? 0.85 : 0.7),
    ),
    shoulder,
  );
  curve(
    near,
    shoulder,
    point(back.x - s * 0.3, back.y - s * 0.025),
    point(back.x - s * 0.1, back.y - s * 0.015),
    back,
  );
  curve(
    near,
    back,
    point(back.x + s * 0.05, back.y),
    point(landing.x - s * 0.13, landing.y),
    point(landing.x + s * 0.015, landing.y + s * 0.025),
  );
  curve(
    near,
    near[near.length - 1],
    point(heel.x + s * 0.04, heel.y - s * 0.14),
    point(toe.x - s * 0.23, toe.y - s * 0.055),
    point(toe.x, toe.y + s * 0.015),
  );
  curve(
    near,
    near[near.length - 1],
    point(toe.x + s * 0.2, toe.y + s * 0.63),
    uv(0.82, g.portrait ? 0.937 : 0.953),
    uv(1.06, 0.979),
  );

  curve(
    farShore,
    point(w + s, far.y - s * 0.15),
    point(far.x + s * 1.45, far.y - s * 0.26),
    point(far.x + s * 0.25, far.y - s * 0.17),
    point(far.x - s * 0.025, far.y + s * 0.03),
  );
  curve(
    farShore,
    farShore[farShore.length - 1],
    point(far.x - s * 0.22, far.y + s * 0.26),
    point(farToe.x + s * 0.23, farToe.y - s * 0.05),
    point(farToe.x, farToe.y + s * 0.015),
  );
  curve(
    farShore,
    farShore[farShore.length - 1],
    point(farToe.x - s * 0.15, farToe.y + s * 0.48),
    uv(0.99, 0.923),
    uv(1.06, 0.956),
  );

  const trace = (target: CanvasRenderingContext2D, points: Point[]) => {
    target.beginPath();
    points.forEach((p, i) =>
      i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y),
    );
  };
  const fill = (points: Point[], color: string) => {
    trace(ctx, points);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const bank = (shore: Point[], close: Point[], distant: boolean) => {
    const outline = shore.concat(close);
    // Contact is a broken, soft wash on the actual water edge, not a stone necklace.
    trace(contact, shore);
    contact.strokeStyle = distant ? "rgba(40,71,76,.08)" : "rgba(35,65,71,.09)";
    contact.lineJoin = "round";
    contact.lineWidth = s * 0.06;
    contact.stroke();
    fill(outline, distant ? "#718986" : "#6a8581");
    ctx.save();
    ctx.clip();
    const wash = ctx.createLinearGradient(0, landing.y, w * 0.18, h * 1.05);
    wash.addColorStop(0, "rgba(148,164,139,.13)");
    wash.addColorStop(0.55, "rgba(57,91,91,.025)");
    wash.addColorStop(1, "rgba(29,65,75,.24)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    // A broad secondary earth plane, as spare as the painted mountain ridges.
    if (!distant) {
      ctx.beginPath();
      ctx.moveTo(w * (g.portrait ? 0.18 : 0.46), h * 1.08);
      ctx.bezierCurveTo(
        w * (g.portrait ? 0.36 : 0.6),
        h * 1.003,
        landing.x - s * 0.13,
        landing.y + s * 1.24,
        landing.x + s * (g.portrait ? 0.35 : 0.15),
        landing.y + s * (g.portrait ? 0.65 : 0.41),
      );
      ctx.bezierCurveTo(
        landing.x + s * (g.portrait ? 1.3 : 0.42),
        landing.y + s * (g.portrait ? 0.8 : 1.54),
        w * 0.9,
        h * 0.992,
        w * 1.06,
        h * 1.012,
      );
      ctx.lineTo(w * 1.06, h * 1.08);
      ctx.closePath();
      ctx.fillStyle = "rgba(38,73,80,.08)";
      ctx.fill();
    }
    // Thin, translucent mineral striations share the distant hills' wash texture.
    for (let i = 0; i < (distant ? 95 : 390); i++) {
      const x = distant
        ? farToe.x + random() * s * 3
        : w * (0.46 + random() * 0.6);
      const y = landing.y + random() * (h * 1.1 - landing.y);
      const length = s * (0.25 + random() * 1.0);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const across = g.portrait ? 1.8 : 1;
      const down = g.portrait ? 0.58 : 1;
      ctx.bezierCurveTo(
        x + length * 0.12 * across,
        y + length * 0.27 * down,
        x + length * 0.44 * across,
        y + length * 0.48 * down,
        x + length * 0.37 * across,
        y + length * down,
      );
      ctx.strokeStyle = `rgba(37,74,83,${0.02 + random() * 0.055})`;
      ctx.lineWidth = 0.35 + random() * 1.25;
      ctx.stroke();
    }
    // Sparse, tapered dry-brush marks describe the slope instead of lawn texture.
    for (let i = 0; i < (distant ? 5 : 14); i++) {
      const x = distant
        ? farToe.x + random() * s * 2
        : w * (0.5 + random() * 0.5);
      const y = landing.y + random() * (h * 1.04 - landing.y);
      const length = s * (0.14 + random() * 0.4);
      fill(
        [
          point(x, y),
          point(x + length, y - length * 0.25),
          point(x + length * 0.46, y - length * 0.015),
        ],
        "rgba(35,72,77,.13)",
      );
    }
    ctx.restore();
    // Only discontinuous tide marks; no outlined perimeter or repeated edging.
    for (let i = 12; i < shore.length - 4; i += 31) {
      const p = shore[i],
        q = shore[Math.min(i + 5, shore.length - 1)];
      contact.beginPath();
      contact.moveTo(p.x - s * 0.035, p.y + s * 0.026);
      contact.quadraticCurveTo(
        (p.x + q.x) * 0.5,
        (p.y + q.y) * 0.5 + s * 0.032,
        q.x + s * 0.06,
        q.y + s * 0.02,
      );
      contact.strokeStyle = "rgba(156,179,167,.18)";
      contact.lineWidth = Math.max(0.45, s * 0.009);
      contact.stroke();
    }
  };
  bank(farShore, [uv(1.08, 0.98), point(w + s, far.y - s * 0.15)], true);
  bank(foreground, [uv(-0.04, 1.06)], false);
  bank(near, [uv(1.06, 1.06), uv(g.portrait ? 0.18 : 0.42, 1.06)], false);

  // A few overlapping ink-and-wash stones seat the foundations. Their flat bases
  // remain on the projected waterline; no stones march along the rest of the bank.
  const stone = (x: number, y: number, r: number, rise: number) => {
    const crown = point(x - r * (0.12 + random() * 0.18), y - rise);
    const points = [
      point(x - r, y),
      point(x - r * 0.69, y - rise * 0.63),
      crown,
      point(x + r * 0.55, y - rise * 0.83),
      point(x + r, y - rise * 0.12),
      point(x + r * 0.59, y + rise * 0.045),
    ];
    ctx.beginPath();
    const last = points[points.length - 1];
    ctx.moveTo((last.x + points[0].x) * 0.5, (last.y + points[0].y) * 0.5);
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      ctx.quadraticCurveTo(
        p.x,
        p.y,
        (p.x + next.x) * 0.5,
        (p.y + next.y) * 0.5,
      );
    });
    ctx.closePath();
    ctx.fillStyle = "#4c6e70";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(x - r, y - rise);
    ctx.lineTo(x + r, y - rise);
    ctx.bezierCurveTo(
      x + r * 0.43,
      y - rise * 0.21,
      x - r * 0.27,
      y - rise * 0.53,
      x - r * 0.7,
      y - rise * 0.16,
    );
    ctx.closePath();
    ctx.fillStyle = "#758c81";
    ctx.fill();
    ctx.restore();
    contact.beginPath();
    contact.ellipse(x, y + s * 0.025, r * 1.14, s * 0.035, 0, 0, Math.PI * 2);
    contact.fillStyle = "rgba(36,66,72,.17)";
    contact.fill();
  };
  stone(toe.x - s * 0.31, toe.y + s * 0.055, s * 0.24, s * 0.145);
  stone(toe.x - s * 0.02, toe.y + s * 0.058, s * 0.19, s * 0.11);
  stone(toe.x - s * 0.18, toe.y + s * 0.082, s * 0.15, s * 0.09);
  stone(farToe.x + s * 0.22, farToe.y + s * 0.046, s * 0.24, s * 0.14);
  stone(farToe.x + s * 0.015, farToe.y + s * 0.056, s * 0.15, s * 0.075);
}
