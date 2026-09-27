import { moonPosition, WATER_HORIZON } from "./composition";
import { plantMaskColor, reedDepth } from "./plantMotion";

// All landscape textures are drawn locally from seeded geometry. No image assets.
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Painting {
  canvas: HTMLCanvasElement;
  depth: number;
  kind: "paint" | "water" | "willow" | "reeds" | "shallows";
  windMap?: HTMLCanvasElement;
  fallback?: HTMLCanvasElement;
}
function surface(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  return { canvas, ctx };
}
function contour(x: number, band: number) {
  const center = Math.pow(Math.abs(x - 0.51) * 1.8, 0.8);
  return (
    0.7 -
    center * (0.19 + band * 0.015) -
    Math.sin(x * 12 + band * 1.8) * 0.035 -
    Math.sin(x * 29 + band * 2.5) * 0.015 -
    Math.sin(x * 71 + band) * 0.0035
  );
}
export function paintLandscape(w: number, h: number): Painting[] {
  const portrait = w / h < 0.85;
  const paintings: Painting[] = [];
  const random = seeded(41);
  const add = (depth: number, kind: Painting["kind"] = "paint") => {
    const s = surface(w, h);
    paintings.push({ canvas: s.canvas, depth, kind });
    return s.ctx;
  };
  // Moon: mineral washes and tiny craters, softened at the limb.
  let ctx = add(2);
  const moonLocation = moonPosition(w, h);
  const mx = w * moonLocation.x,
    my = h * (1 - moonLocation.y);
  const radius = h * moonLocation.radius;
  const halo = ctx.createRadialGradient(
    mx,
    my,
    radius * 0.7,
    mx,
    my,
    radius * 2.6,
  );
  halo.addColorStop(0, "rgba(226,233,216,.13)");
  halo.addColorStop(1, "rgba(226,233,216,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(mx - radius * 3, my - radius * 3, radius * 6, radius * 6);
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.clip();
  const moon = ctx.createRadialGradient(
    mx - radius * 0.35,
    my - radius * 0.4,
    0,
    mx + radius * 0.45,
    my + radius * 0.5,
    radius * 1.8,
  );
  moon.addColorStop(0, "#e9e5ce");
  moon.addColorStop(0.45, "#c8d5ce");
  moon.addColorStop(1, "#8faabd");
  ctx.fillStyle = moon;
  ctx.fillRect(mx - radius, my - radius, radius * 2, radius * 2);
  for (let i = 0; i < 1400; i++) {
    const x = mx + (random() * 2 - 1) * radius,
      y = my + (random() * 2 - 1) * radius,
      r = random() * radius * 0.1;
    ctx.fillStyle = `rgba(71,103,126,${random() * 0.025})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.65, random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Successive mountain ranges: detailed contours, mineral strata, and low fog.
  const mountains: HTMLCanvasElement[] = [];
  ["#9bb1bc", "#839fae", "#638591"].forEach((color, band) => {
    ctx = add(2.5 + band);
    mountains.push(paintings[paintings.length - 1].canvas);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-30, h);
    for (let x = -30; x <= w + 30; x += 3) {
      const nx = x / w;
      const y =
        contour(nx, band) * h +
        (band - 1) * h * 0.048 +
        (random() - 0.5) * h * 0.002;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 30, h);
    ctx.closePath();
    ctx.clip();
    const wash = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.79);
    wash.addColorStop(0, color);
    wash.addColorStop(1, "#a7bbbd");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const x = random() * w,
        y = contour(x / w, band) * h + (band - 1) * h * 0.048;
      const extent = h * (0.014 + random() * 0.12);
      ctx.strokeStyle = `rgba(39,79,91,${0.008 + random() * 0.027})`;
      ctx.lineWidth = random() * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y + random() * 60);
      ctx.bezierCurveTo(
        x - extent * 0.2,
        y + extent * 0.3,
        x + extent * 0.17,
        y + extent * 0.65,
        x - extent * 0.38,
        y + extent,
      );
      ctx.stroke();
    }
    const mist = ctx.createLinearGradient(0, h * 0.6, 0, h * 0.79);
    mist.addColorStop(0, "rgba(174,194,195,0)");
    mist.addColorStop(1, "rgba(174,194,195,.85)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.restore();
  });
  // River with reflected mountains. The shader displaces this reflection gently.
  ctx = add(3, "water");
  const horizon = h * (1 - WATER_HORIZON);
  const waterStart = horizon - h * 0.065;
  const water = ctx.createLinearGradient(0, waterStart, 0, h);
  water.addColorStop(0, "#a1b8b9");
  water.addColorStop(0.32, "#769ca7");
  water.addColorStop(1, "#345e70");
  ctx.fillStyle = water;
  ctx.fillRect(0, waterStart, w, h - waterStart);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterStart, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.13;
  ctx.translate(0, horizon * 2);
  ctx.scale(1, -1);
  mountains.forEach((m) => ctx.drawImage(m, 0, 0));
  ctx.restore();
  // Only the static fallback needs painted highlights. WebGL derives all glints
  // from the wave normals, so no bright dashes remain glued to moving water.
  const river = ctx;
  const stillRiver = surface(w, h);
  stillRiver.ctx.drawImage(paintings[paintings.length - 1].canvas, 0, 0);
  paintings[paintings.length - 1].fallback = stillRiver.canvas;
  ctx = stillRiver.ctx;
  for (let i = 0; i < 1000; i++) {
    const y = horizon + random() * (h - horizon),
      dist = (y - horizon) / (h - horizon),
      x = random() * w;
    ctx.strokeStyle = `rgba(211,219,208,${random() * 0.15 * dist})`;
    ctx.lineWidth = 0.4 + dist * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + random() * w * 0.065 * dist + 1, y);
    ctx.stroke();
  }
  // Moon path, diffuse and broken by the current.
  for (let i = 0; i < 200; i++) {
    const y = horizon + random() * (h - horizon),
      dist = (y - horizon) / (h - horizon);
    const x = mx + (random() - 0.5) * radius * (0.7 + dist * 3.3);
    ctx.fillStyle = `rgba(235,227,194,${random() * 0.11})`;
    ctx.fillRect(x, y, random() * radius * 0.35 + 2, 0.5 + dist);
  }
  // Dissolve the river into the mist rather than exposing the texture's straight edge.
  for (const waterContext of [river, stillRiver.ctx]) {
    waterContext.save();
    waterContext.globalCompositeOperation = "destination-in";
    const riverFade = waterContext.createLinearGradient(
      0,
      waterStart,
      0,
      horizon + h * 0.055,
    );
    riverFade.addColorStop(0, "rgba(255,255,255,0)");
    riverFade.addColorStop(0.4, "rgba(255,255,255,.18)");
    riverFade.addColorStop(1, "rgba(255,255,255,1)");
    waterContext.fillStyle = riverFade;
    waterContext.fillRect(0, 0, w, h);
    waterContext.restore();
  }
  // Stone bridge. A true open arch, with irregular blocks and a curved parapet.
  ctx = add(4);
  const bx = w * (portrait ? 0.53 : 0.665),
    by = h * (portrait ? 0.83 : 0.81);
  const bw = w * (portrait ? 0.64 : 0.4),
    bh = h * (portrait ? 0.083 : 0.125);
  // Visible stair treads give the bridge a walkable top surface. The lower
  // tread uses the same two corners as the quay, rather than meeting at a point.
  const tread = (t: number, back: boolean) => {
    const u = 1 - t;
    const x =
      bx + bw * (3 * u * u * t * 0.15 + 3 * u * t * t * 0.77 + t * t * t);
    const y =
      by +
      bh *
        (u * u * u * 0.56 -
          3 * u * u * t * 0.89 -
          3 * u * t * t * 0.99 +
          t * t * t * 0.08);
    return {
      x: x - (back ? w * 0.034 * (1 - t * 0.65) : 0),
      y: y - (back ? h * 0.014 * (1 - t * 0.65) : 0),
    };
  };
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const p = tread(i / 60, false);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  }
  for (let i = 60; i >= 0; i--) {
    const p = tread(i / 60, true);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = "#899b97";
  ctx.fill();
  for (let i = 0; i <= 45; i++) {
    const a = tread(i / 45, false),
      b = tread(i / 45, true);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "rgba(50,76,79,.45)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  const bridge = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(bx, by + bh * 0.6);
    c.bezierCurveTo(
      bx + bw * 0.15,
      by - bh * 0.85,
      bx + bw * 0.77,
      by - bh * 0.95,
      bx + bw,
      by + bh * 0.12,
    );
    c.lineTo(bx + bw, by + bh * 0.9);
    c.lineTo(bx + bw * 0.81, by + bh * 0.9);
    c.bezierCurveTo(
      bx + bw * 0.72,
      by - bh * 0.23,
      bx + bw * 0.34,
      by - bh * 0.39,
      bx + bw * 0.21,
      by + bh * 0.91,
    );
    c.lineTo(bx, by + bh * 0.91);
    c.closePath();
  };
  bridge(ctx);
  ctx.fillStyle = "#536f78";
  ctx.fill();
  ctx.save();
  bridge(ctx);
  ctx.clip();
  const stone = ctx.createLinearGradient(0, by - bh, 0, by + bh);
  stone.addColorStop(0, "#9ba9a7");
  stone.addColorStop(0.6, "#68838a");
  stone.addColorStop(1, "#425e69");
  ctx.fillStyle = stone;
  ctx.fillRect(bx, by - bh, bw, bh * 2);
  for (let row = 0; row < 12; row++) {
    const y = by - bh + row * bh * 0.17;
    ctx.strokeStyle = "rgba(35,67,77,.23)";
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + bw, y);
    ctx.stroke();
    for (let col = 0; col < 19; col++) {
      const x = bx + ((col + (row % 2) * 0.5) * bw) / 17;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 4, y + bh * 0.17);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = `rgba(211,209,188,${random() * 0.06})`;
    ctx.fillRect(
      bx + random() * bw,
      by - bh + random() * bh * 2,
      random() * 7,
      1,
    );
  }
  ctx.restore();
  // Arch voussoirs follow its inner curve.
  for (let t = 0.04; t < 0.99; t += 0.045) {
    const x = bx + bw * (0.21 + t * 0.6),
      archY = by + bh * (0.9 - 1.4 * Math.sin(Math.PI * t));
    ctx.strokeStyle = "rgba(189,198,181,.38)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, archY);
    ctx.lineTo(x + (t - 0.5) * bh * 0.24, archY - bh * 0.12);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(bx, by + bh * 0.54);
  ctx.bezierCurveTo(
    bx + bw * 0.15,
    by - bh * 0.91,
    bx + bw * 0.77,
    by - bh * 1.01,
    bx + bw,
    by + bh * 0.06,
  );
  ctx.strokeStyle = "#c0c4b4";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Sparse uprights rather than a heavy railing.
  for (let i = 0; i <= 22; i++) {
    const t = i / 22,
      u = 1 - t;
    const x =
      bx + bw * (3 * u * u * t * 0.15 + 3 * u * t * t * 0.77 + t * t * t);
    const y =
      by +
      bh *
        (u * u * u * 0.54 -
          3 * u * u * t * 0.91 -
          3 * u * t * t * 1.01 +
          t * t * t * 0.06);
    ctx.strokeStyle = "#8c9f9e";
    ctx.lineWidth = portrait ? 2.2 : 3.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - bh * 0.13);
    ctx.stroke();
  }
  // Banks and reeds anchor the painting at its lower edges.
  ctx = add(4);
  ctx.fillStyle = "#355965";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.9);
  ctx.bezierCurveTo(w * 0.055, h * 0.87, w * 0.13, h * 0.94, w * 0.31, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = "#426773";
  ctx.beginPath();
  ctx.moveTo(w, h * 0.86);
  ctx.bezierCurveTo(w * 0.92, h * 0.87, w * 0.88, h * 0.96, w * 0.83, h);
  ctx.lineTo(w, h);
  ctx.fill();
  // An irregular, softly washed bank rises to the bridge's first step.
  // The bridge and its footing share parallax depth so their contact stays fixed.
  const deck = by + bh * 0.56,
    foot = by + bh * 0.91;
  ctx.beginPath();
  ctx.moveTo(bx - w * 0.23, h * 1.04);
  ctx.bezierCurveTo(
    bx - w * 0.16,
    h * 0.99,
    bx - w * 0.13,
    deck + h * 0.04,
    bx - w * 0.04,
    deck - h * 0.013,
  );
  ctx.bezierCurveTo(
    bx - w * 0.022,
    deck - h * 0.022,
    bx - w * 0.007,
    deck - h * 0.01,
    bx,
    deck + h * 0.001,
  );
  ctx.bezierCurveTo(
    bx + bw * 0.045,
    foot - h * 0.007,
    bx + bw * 0.15,
    foot - h * 0.005,
    bx + bw * 0.215,
    foot + h * 0.004,
  );
  ctx.bezierCurveTo(
    bx + bw * 0.25,
    foot + h * 0.026,
    bx + bw * 0.19,
    h * 0.99,
    bx + bw * 0.31,
    h * 1.04,
  );
  ctx.closePath();
  const bank = ctx.createLinearGradient(bx - w * 0.1, deck, bx, h);
  bank.addColorStop(0, "#718983");
  bank.addColorStop(0.22, "#597a77");
  bank.addColorStop(1, "#345a64");
  ctx.fillStyle = bank;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Broken mineral and moss washes, with no outlined paving or regular grid.
  for (let i = 0; i < 950; i++) {
    const x = bx - w * 0.24 + random() * w * 0.43,
      y = deck + random() * (h - deck);
    ctx.fillStyle = `rgba(${i % 3 ? "126,151,131" : "35,74,76"},${0.025 + random() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      w * (0.002 + random() * 0.014),
      h * (0.001 + random() * 0.004),
      -0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
  // Reed beds include submerged stems and reflections beneath their living foliage.
  const shallows = add(3, "shallows");
  ctx = add(3, "reeds");
  const reedWind = surface(w, h);
  paintings[paintings.length - 1].windMap = reedWind.canvas;
  // Phragmites (芦苇): arching leaves and airy seed plumes in uneven shoreline clumps.
  const reeds = (
    rootX: number,
    rootY: number,
    count: number,
    height: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const x = rootX + (random() - 0.5) * w * 0.035,
        y = rootY + random() * h * 0.016;
      const stemHeight = height * (0.48 + random() * 0.65);
      const lean = (random() - 0.35) * w * 0.026;
      const tipX = x + lean,
        tipY = y - stemHeight;
      const submerged = shallows.createLinearGradient(
        0,
        y - h * 0.005,
        0,
        y + h * 0.035,
      );
      submerged.addColorStop(0, "rgba(39,76,79,.32)");
      submerged.addColorStop(1, "rgba(39,76,79,0)");
      shallows.strokeStyle = submerged;
      shallows.lineWidth = 0.8;
      shallows.beginPath();
      shallows.moveTo(x, y - h * 0.003);
      shallows.bezierCurveTo(
        x + lean * 0.12,
        y + h * 0.008,
        x - lean * 0.15,
        y + h * 0.02,
        x + lean * 0.1,
        y + h * 0.035,
      );
      shallows.stroke();
      const stem = ctx.createLinearGradient(
        0,
        y - stemHeight,
        0,
        y + h * 0.004,
      );
      stem.addColorStop(0, "rgba(41,76,82,.8)");
      stem.addColorStop(0.78, "rgba(41,76,82,.65)");
      stem.addColorStop(0.94, "rgba(41,76,82,.27)");
      stem.addColorStop(1, "rgba(41,76,82,0)");
      ctx.strokeStyle = stem;
      ctx.lineWidth = 0.6 + random() * 0.65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.2, y - stemHeight * 0.6, tipX, tipY);
      ctx.stroke();
      for (let leaf = 0; leaf < 3; leaf++) {
        const t = 0.24 + leaf * 0.18,
          ly = y - stemHeight * t,
          lx = x + lean * t * t;
        const side = (i + leaf) % 2 ? 1 : -1,
          length = stemHeight * (0.17 + random() * 0.16);
        ctx.fillStyle = `rgba(47,82,84,${0.35 + random() * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(
          lx + side * length * 0.65,
          ly - length * 0.45,
          lx + side * length,
          ly - length * 0.12,
        );
        ctx.quadraticCurveTo(
          lx + side * length * 0.55,
          ly - length * 0.24,
          lx,
          ly,
        );
        ctx.fill();
      }
      if (i % 4 !== 0) {
        const plume = stemHeight * (0.16 + random() * 0.09);
        const shade = i % 3 === 0 ? "174,174,142" : "99,126,117";
        for (let j = 0; j < 16; j++) {
          const t = j / 16,
            py = tipY + plume * t,
            breadth = Math.sin(t * Math.PI) * plume * 0.2;
          ctx.strokeStyle = `rgba(${shade},${0.28 + random() * 0.3})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(tipX + t * lean * 0.14, py);
          ctx.lineTo(tipX - breadth, py - plume * 0.15);
          ctx.moveTo(tipX + t * lean * 0.14, py);
          ctx.lineTo(tipX + breadth, py - plume * 0.12);
          ctx.stroke();
        }
      }
    }
  };
  // Uneven patches stand clear of both dry banks and the bridge approach.
  const patches = [
    [0.085, 0.891, 18, 0.105],
    [0.15, 0.921, 22, 0.1],
    [0.225, 0.953, 19, 0.092],
    [0.29, 0.985, 12, 0.072],
    [0.84, 0.966, 20, 0.09],
    [0.91, 0.898, 15, 0.08],
  ];
  for (const [x, y, count, size] of patches) {
    // Broad, almost invisible submerged color joins the patch to the shallows.
    shallows.save();
    shallows.translate(w * x, h * (y + 0.014));
    shallows.scale(1, 0.16);
    const bed = shallows.createRadialGradient(0, 0, 0, 0, 0, w * 0.045);
    bed.addColorStop(0, "rgba(43,81,80,.24)");
    bed.addColorStop(0.5, "rgba(68,105,100,.12)");
    bed.addColorStop(1, "rgba(68,105,100,0)");
    shallows.fillStyle = bed;
    shallows.fillRect(-w * 0.05, -w * 0.05, w * 0.1, w * 0.1);
    shallows.restore();
    const mask = reedWind.ctx.createLinearGradient(
      0,
      h * (y - size * 1.15),
      0,
      h * y,
    );
    const depth = reedDepth(y);
    const reach = size * 1.15 * depth;
    mask.addColorStop(0, plantMaskColor(1, depth, reach));
    mask.addColorStop(0.65, plantMaskColor(68 / 255, depth, reach * 0.35));
    mask.addColorStop(0.9, plantMaskColor(0, depth, reach * 0.1));
    mask.addColorStop(1, plantMaskColor(0, depth, 0));
    reedWind.ctx.fillStyle = mask;
    reedWind.ctx.fillRect(
      w * (x - 0.06),
      h * (y - size * 1.2),
      w * 0.12,
      h * (size * 1.2 + 0.035),
    );
    reeds(w * x, h * y, count, h * size);
    // Small broken glints cross the submerged stems, rather than ringing a clump.
    for (let i = 0; i < 23; i++) {
      const px = w * (x + (random() - 0.5) * 0.065),
        py = h * (y + 0.005 + random() * 0.027);
      shallows.strokeStyle = `rgba(157,188,177,${0.09 + random() * 0.15})`;
      shallows.lineWidth = 0.55;
      shallows.beginPath();
      shallows.moveTo(px, py);
      shallows.quadraticCurveTo(
        px + w * 0.004,
        py + h * 0.0008,
        px + w * (0.003 + random() * 0.01),
        py,
      );
      shallows.stroke();
    }
  }
  // Willow, grown from a deterministic branching skeleton.
  ctx = add(5);
  // Keep a minimum local aspect ratio instead of squeezing branches on phones.
  // Narrow viewports crop a wider tree at the left edge, preserving branch angles,
  // leaf shapes, and the shared coordinates of wood, foliage, and wind masks.
  const willowWidth = Math.max(w, h * 1.15);
  const willowLeft = -(willowWidth - w) * 0.26;
  ctx.save();
  ctx.translate(willowLeft, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  type Limb = { points: number[]; width: number };
  const limbs: Limb[] = [
    {
      points: [-0.045, 1.03, 0.04, 0.82, 0.063, 0.58, -0.007, 0.37],
      width: willowWidth * 0.032,
    },
  ];
  const sample = (p: number[], t: number) => {
    const u = 1 - t;
    return {
      x:
        (u * u * u * p[0] +
          3 * u * u * t * p[2] +
          3 * u * t * t * p[4] +
          t * t * t * p[6]) *
        willowWidth,
      y:
        (u * u * u * p[1] +
          3 * u * u * t * p[3] +
          3 * u * t * t * p[5] +
          t * t * t * p[7]) *
        h,
    };
  };
  // Each child starts on its parent's centerline, never at an approximate freehand point.
  // A short overlap and matched initial tangent give every joint a continuous silhouette.
  const grow = (
    parentIndex: number,
    t: number,
    endX: number,
    endY: number,
    width: number,
    bendX: number,
    bendY: number,
  ) => {
    const parent = limbs[parentIndex];
    const behind = sample(parent.points, Math.max(0, t - 0.045));
    const tangent = sample(parent.points, Math.min(1, t + 0.1));
    limbs.push({
      points: [
        behind.x / willowWidth,
        behind.y / h,
        tangent.x / willowWidth,
        tangent.y / h,
        bendX,
        bendY,
        endX,
        endY,
      ],
      width: willowWidth * width,
    });
    // The root cap sits fully inside its parent, including on narrow screens.
  };
  grow(0, 0.39, 0.29, 0.29, 0.016, 0.085, 0.38);
  grow(0, 0.69, 0.16, 0.1, 0.011, 0.026, 0.23);
  grow(0, 0.87, 0.045, 0.065, 0.008, -0.01, 0.19);
  grow(1, 0.56, 0.33, 0.32, 0.006, 0.21, 0.27);
  grow(2, 0.56, 0.225, 0.19, 0.005, 0.14, 0.18);
  grow(1, 0.68, 0.23, 0.4, 0.0035, 0.172, 0.365);
  grow(2, 0.79, 0.2, 0.16, 0.003, 0.154, 0.15);
  limbs.forEach(({ points: p, width }, index) => {
    const sides: { x: number; y: number }[][] = [[], []];
    for (let i = 0; i <= 70; i++) {
      const t = i / 70,
        a = sample(p, t),
        b = sample(p, Math.min(1, t + 0.001)),
        before = sample(p, Math.max(0, t - 0.001));
      const angle = Math.atan2(b.y - before.y, b.x - before.x) + Math.PI / 2;
      const radius = width * 0.5 * Math.pow(1 - t, 0.85) + 0.2;
      sides[0].push({
        x: a.x + Math.cos(angle) * radius,
        y: a.y + Math.sin(angle) * radius,
      });
      sides[1].push({
        x: a.x - Math.cos(angle) * radius,
        y: a.y - Math.sin(angle) * radius,
      });
    }
    ctx.fillStyle = index < 4 ? "#315360" : "#3c606b";
    ctx.beginPath();
    [...sides[0], ...sides[1].reverse()].forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    ctx.fill();
    // Fine broken bark follows the growth of each branch.
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = `rgba(156,177,164,${0.025 + random() * 0.06})`;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let j = 0; j < 45; j++) {
        const t = j / 60,
          point = sample(p, t),
          offset = (i / 9 - 0.5) * width * (1 - t);
        j
          ? ctx.lineTo(point.x + offset, point.y)
          : ctx.moveTo(point.x + offset, point.y);
      }
      ctx.stroke();
    }
  });
  ctx.restore();
  // Keep the woody skeleton still; only the hanging foliage responds to wind.
  ctx = add(5, "willow");
  ctx.save();
  ctx.translate(willowLeft, 0);
  const willowWind = surface(w, h);
  paintings[paintings.length - 1].windMap = willowWind.canvas;
  willowWind.ctx.translate(willowLeft, 0);
  const foliageRoots: { x: number; y: number }[] = [];
  // Foliage grows from the outer limbs, in irregular overlapping clusters.
  for (let i = 0; i < 230; i++) {
    const limb = limbs[1 + Math.floor(random() * (limbs.length - 1))];
    const start = sample(limb.points, 0.42 + random() * 0.58);
    const x = start.x,
      top = start.y;
    const length = h * (0.065 + random() * 0.23),
      bend = (random() - 0.35) * willowWidth * 0.025;
    foliageRoots.push({ x, y: top });
    const mask = willowWind.ctx.createLinearGradient(0, top, 0, top + length);
    // The foreground canopy has a shallow depth gradient. Use local tree
    // coordinates so portrait cropping does not change its physical proportions.
    const depth = 4.6 + 2.4 * Math.max(0, Math.min(0.4, x / willowWidth));
    const reach = (length / h) * depth;
    mask.addColorStop(0, plantMaskColor(0, depth, 0));
    mask.addColorStop(0.15, plantMaskColor(17 / 255, depth, reach * 0.15));
    mask.addColorStop(1, plantMaskColor(1, depth, reach));
    willowWind.ctx.strokeStyle = mask;
    // Cover the swept area as well as the resting leaves: a narrow mask clips
    // inverse texture displacement when a flexible shoot bends downwind.
    willowWind.ctx.lineWidth = 64;
    willowWind.ctx.beginPath();
    willowWind.ctx.moveTo(x, top);
    willowWind.ctx.bezierCurveTo(
      x + bend,
      top + length * 0.3,
      x - bend * 0.3,
      top + length * 0.7,
      x + bend * 0.3,
      top + length,
    );
    willowWind.ctx.stroke();
    ctx.strokeStyle = `rgba(45,79,87,${0.22 + random() * 0.29})`;
    ctx.lineWidth = 0.35 + random() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.bezierCurveTo(
      x + bend,
      top + length * 0.3,
      x - bend * 0.3,
      top + length * 0.7,
      x + bend * 0.3,
      top + length,
    );
    ctx.stroke();
    for (let j = 0; j < length / 6; j++) {
      const t = j / (length / 6),
        ly =
          top +
          length *
            (0.9 * (1 - t) * (1 - t) * t + 2.1 * (1 - t) * t * t + t * t * t),
        lx =
          x +
          bend *
            (3 * (1 - t) * (1 - t) * t -
              0.9 * (1 - t) * t * t +
              0.3 * t * t * t);
      const side = j % 2 ? 1 : -1,
        size = (2 + random() * 5) * (1 - t * 0.5);
      ctx.fillStyle = `rgba(${43 + Math.floor(random() * 22)},${77 + Math.floor(random() * 25)},${85 + Math.floor(random() * 20)},${0.28 + random() * 0.42})`;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(
        lx + side * size * 0.8,
        ly + size * 0.45,
        lx + side * size * 0.55,
        ly + size * 2,
      );
      ctx.quadraticCurveTo(lx - side, ly + size * 0.4, lx, ly);
      ctx.fill();
    }
  }
  ctx.restore();
  // Pin every stem attachment even where neighboring foliage masks overlap.
  willowWind.ctx.fillStyle = "black";
  for (const root of foliageRoots) {
    willowWind.ctx.beginPath();
    willowWind.ctx.arc(root.x, root.y, 3, 0, Math.PI * 2);
    willowWind.ctx.fill();
  }
  return paintings;
}
export function drawFallback(canvas: HTMLCanvasElement, paintings: Painting[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#526f95");
  sky.addColorStop(0.5, "#87a5b8");
  sky.addColorStop(1, "#bfc7bf");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  paintings.forEach((p) => ctx.drawImage(p.fallback ?? p.canvas, 0, 0, w, h));
}
