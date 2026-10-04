import { moonPosition, WATER_HORIZON } from "./composition";
import { plantMaskColor, reedDepth } from "./plantMotion";
import { paintBridge, paintBridgeWaterShadow } from "./bridge";
import { paintBanks } from "./banks";
import { createBridgeGeometry } from "./bridgeGeometry";
import { lightResponse, lightingGain, normalColor, LightingState, sampleLighting, srgbToLinear, linearToSrgb, moonRadiance } from "./lighting";
import { cloudOpticalDepth, cloudTransmission, sampleCloudColor, sampleSkyBaseColor, sampleSkyColor } from "./clouds";
import { waterSpecular, WATER_EXPOSURE } from "./waterLighting";
import { OVERSCAN } from "./moon";
import {
  BANK_REFLECTANCE, bridgeBarriers, createWaveBoundary, screenBarrier,
  STONE_REFLECTANCE, WaveBoundaryField,
} from "./waveBoundary";

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
  kind: "paint" | "moon" | "water" | "willow" | "reeds" | "shallows";
  windMap?: HTMLCanvasElement;
  shadowMap?: HTMLCanvasElement;
  /** River edges for wave reflection and lee sheltering, in bridge-layer UV. */
  waveBoundary?: WaveBoundaryField;
  fallback?: HTMLCanvasElement;
  normalMap?: HTMLCanvasElement;
  lightStrength?: number;
  twoSided?: boolean;
  /** Exact mountain skyline in normalized UV coordinates, with Y pointing up. */
  ridge?: { x: number; y: number }[];
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
/** Broad terrain planes omit the skyline's cusp and small brush-scale ridges. */
function lightingContour(x: number, band: number) {
  const center = Math.pow(Math.hypot(x - 0.51, 0.055) * 1.8, 0.8);
  return (
    0.7 -
    center * (0.19 + band * 0.015) -
    Math.sin(x * 12 + band * 1.8) * 0.035 -
    Math.sin(x * 29 + band * 2.5) * 0.007
  );
}
/**
 * WebGL computes its ripples live, so it can skip the static river that only
 * the Canvas fallback draws. The random sequence is consumed either way.
 */
export function paintLandscape(w: number, h: number, includeFallback = true): Painting[] {
  const paintings: Painting[] = [];
  const random = seeded(41);
  const add = (depth: number, kind: Painting["kind"] = "paint") => {
    const s = surface(w, h);
    paintings.push({ canvas: s.canvas, depth, kind });
    return s.ctx;
  };
  // Moon: mineral washes and tiny craters, softened at the limb.
  const moonLocation = moonPosition(w, h);
  const moonSprite = surface(Math.ceil(h * moonLocation.radius * 6), Math.ceil(h * moonLocation.radius * 6));
  paintings.push({ canvas: moonSprite.canvas, depth: 2, kind: "moon" });
  let ctx = moonSprite.ctx;
  const radius = moonSprite.canvas.width / 6;
  const mx = radius * 3, my = radius * 3;
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
    const mountain = paintings[paintings.length - 1];
    mountains.push(mountain.canvas);
    mountain.ridge = [];
    mountain.lightStrength = 0.24;
    const normals = surface(w, h);
    mountain.normalMap = normals.canvas;
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
      mountain.ridge.push({ x: x / w, y: 1 - y / h });
      // Soft planes vary over a broad neighborhood; the exact painted skyline
      // remains unchanged. Bounded slopes also keep portrait relighting gentle.
      const broadSlope =
        ((lightingContour(nx + 0.025, band) - lightingContour(nx - 0.025, band)) * h) /
        (0.05 * w);
      const slope = Math.tanh(broadSlope / 0.8) * 0.8;
      normals.ctx.fillStyle = normalColor(slope * 0.85, 0.8, -0.28);
      normals.ctx.fillRect(x - 1, 0, 4, h);
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
    // Let low ridge edges disappear into the same mist as their painted faces.
    // A color wash alone leaves the clipped contour legible behind the bridge.
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    const mountainFade = ctx.createLinearGradient(
      0,
      h * (1 - WATER_HORIZON - 0.085),
      0,
      h * (1 - WATER_HORIZON + 0.035),
    );
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      mountainFade.addColorStop(
        t,
        `rgba(255,255,255,${1 - t * t * (3 - 2 * t)})`,
      );
    }
    ctx.fillStyle = mountainFade;
    ctx.fillRect(0, 0, w, h);
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
  // Mirror the mountain silhouettes, then tint them as a faint dark water wash.
  // Copying their pale land colors made the unpainted water between reflections
  // read as solid, upright mountains. Reflected peaks must point down instead.
  const mountainReflection = surface(w, h);
  const reflection = mountainReflection.ctx;
  reflection.save();
  reflection.translate(0, horizon * 2);
  reflection.scale(1, -1);
  reflection.globalAlpha = 0.42;
  mountains.forEach((m) => reflection.drawImage(m, 0, 0));
  reflection.restore();
  reflection.globalCompositeOperation = "source-in";
  const reflectedWash = reflection.createLinearGradient(0, horizon, 0, h);
  // Fade in with zero slope at the horizon, then dissolve toward the viewer.
  // A nonzero first stop exposes a straight seam across the mist.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const onset = Math.min(1, t / 0.28);
    const fadeIn = onset * onset * (3 - 2 * onset);
    const fadeOut = (1 - t) * (1 - t);
    reflectedWash.addColorStop(t, `rgba(44,78,92,${0.16 * fadeIn * fadeOut})`);
  }
  reflection.fillStyle = reflectedWash;
  reflection.fillRect(0, horizon, w, h - horizon);
  ctx.drawImage(mountainReflection.canvas, 0, 0);
  // Only the static fallback needs painted highlights. WebGL derives all glints
  // from the wave normals, so no bright dashes remain glued to moving water.
  const river = ctx;
  const riverPainting = paintings[paintings.length - 1];
  const stillRiver = includeFallback ? surface(w, h) : undefined;
  if (stillRiver) {
    stillRiver.ctx.drawImage(riverPainting.canvas, 0, 0);
    riverPainting.fallback = stillRiver.canvas;
  }
  for (let i = 0; i < 1000; i++) {
    const y = horizon + random() * (h - horizon),
      dist = (y - horizon) / (h - horizon),
      x = random() * w;
    const alpha = random() * 0.15 * dist, length = random() * w * 0.065 * dist + 1;
    if (!stillRiver) continue;
    ctx = stillRiver.ctx;
    ctx.strokeStyle = `rgba(211,219,208,${alpha})`;
    ctx.lineWidth = 0.4 + dist * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.stroke();
  }
  // Preserve the old moon-path random consumption; direct light is now live.
  for (let i = 0; i < 800; i++) random();
  // Dissolve the river into the mist rather than exposing the texture's straight edge.
  for (const waterContext of stillRiver ? [river, stillRiver.ctx] : [river]) {
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
  // Built scenery uses independent seeds so material edits do not regenerate plants.
  // Retain the 9,778 samples consumed by the former bridge and bank artwork.
  for (let i = 0; i < 9778; i++) random();
  const shadowScale = Math.min(1, 640 / w, 560 / h);
  const bridgeShadow = surface(
    Math.max(1, Math.round(w * shadowScale)),
    Math.max(1, Math.round(h * shadowScale)),
  );
  paintBridgeWaterShadow(bridgeShadow.ctx, bridgeShadow.canvas.width, bridgeShadow.canvas.height);
  riverPainting.shadowMap = bridgeShadow.canvas;
  const bankContact = add(4, "shallows");
  const geometry = createBridgeGeometry(w, h);
  ctx = add(4);
  const bridgeNormals = surface(w, h);
  paintings[paintings.length - 1].normalMap = bridgeNormals.canvas;
  paintings[paintings.length - 1].lightStrength = 0.32;
  paintBridge(ctx, w, h, seeded(127), bridgeNormals.ctx);
  ctx = add(4);
  const bankNormals = surface(w, h);
  paintings[paintings.length - 1].normalMap = bankNormals.canvas;
  paintings[paintings.length - 1].lightStrength = 0.26;
  const waterlines = paintBanks(ctx, bankContact, w, h, seeded(289), bankNormals.ctx);
  riverPainting.waveBoundary = createWaveBoundary(w, h, [
    ...bridgeBarriers(geometry),
    ...waterlines.shores.map((shore) => screenBarrier(shore, w, h, BANK_REFLECTANCE)),
    ...waterlines.stones.map((stone) => screenBarrier(stone, w, h, STONE_REFLECTANCE, true, 0)),
  ]);
  const bankCanvas = ctx.canvas;
  // Reed beds include submerged stems and reflections beneath their living foliage.
  const shallows = add(3, "shallows");
  ctx = add(3, "reeds");
  const reedWind = surface(w, h);
  paintings[paintings.length - 1].windMap = reedWind.canvas;
  const reedNormals = surface(w, h);
  reedNormals.ctx.fillStyle = normalColor(0.15, 0.2, -1);
  reedNormals.ctx.fillRect(0, 0, w, h);
  paintings[paintings.length - 1].normalMap = reedNormals.canvas;
  paintings[paintings.length - 1].lightStrength = 0.3;
  paintings[paintings.length - 1].twoSided = true;
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
        reedNormals.ctx.fillStyle = normalColor(side * 0.65, 0.35, -0.75);
        for (const leafContext of [ctx, reedNormals.ctx]) {
          leafContext.beginPath();
          leafContext.moveTo(lx, ly);
          leafContext.quadraticCurveTo(
            lx + side * length * 0.65,
            ly - length * 0.45,
            lx + side * length,
            ly - length * 0.12,
          );
          leafContext.quadraticCurveTo(
            lx + side * length * 0.55,
            ly - length * 0.24,
            lx,
            ly,
          );
          leafContext.fill();
        }
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
  // Portrait groups follow the inlet and the open shallows beneath the arch.
  // Keep counts and order identical so repositioning does not reseed the willow.
  const patches = geometry.portrait
    ? [
        [0.075, 0.91, 18, 0.09],
        [0.155, 0.943, 22, 0.09],
        [0.205, 0.976, 19, 0.08],
        [0.33, 0.85, 12, 0.046],
        [0.19, 0.882, 20, 0.068],
        [0.87, 0.924, 15, 0.057],
      ]
    : [
        [0.085, 0.891, 18, 0.105],
        [0.15, 0.921, 22, 0.1],
        [0.225, 0.953, 19, 0.092],
        [0.36, 0.961, 12, 0.072],
        [0.49, 0.947, 20, 0.085],
        [0.83, 0.865, 15, 0.068],
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
  if (geometry.portrait) {
    // The close bridge-side bed reflects into water, never onto the dry shore.
    shallows.save();
    shallows.globalCompositeOperation = "destination-out";
    shallows.drawImage(bankCanvas, 0, 0);
    shallows.restore();
  }
  // Willow, grown from a deterministic branching skeleton.
  ctx = add(5);
  const woodNormals = surface(w, h);
  paintings[paintings.length - 1].normalMap = woodNormals.canvas;
  paintings[paintings.length - 1].lightStrength = 0.28;
  // Keep a minimum local aspect ratio instead of squeezing branches on phones.
  // Narrow viewports crop a wider tree at the left edge, preserving branch angles,
  // leaf shapes, and the shared coordinates of wood, foliage, and wind masks.
  const willowWidth = Math.max(w, h * 1.15);
  const willowLeft = -(willowWidth - w) * 0.26;
  ctx.save();
  ctx.translate(willowLeft, 0);
  woodNormals.ctx.translate(willowLeft, 0);
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
    [...sides[0], ...sides[1].slice().reverse()].forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    ctx.fill();
    // A few cylindrical strips turn the bark's illuminated rim toward the moon.
    for (let j = 0; j < sides[0].length - 1; j++) {
      const a = sides[0][j], b = sides[1][j];
      const acrossX = a.x - b.x, acrossY = a.y - b.y;
      const breadth = Math.hypot(acrossX, acrossY) || 1;
      for (let strip = 0; strip < 8; strip++) {
        const left = strip / 8, right = (strip + 1) / 8;
        const side = left + right - 1;
        woodNormals.ctx.fillStyle = normalColor(
          acrossX / breadth * side, -acrossY / breadth * side,
          -Math.sqrt(Math.max(0, 1 - side * side)),
        );
        woodNormals.ctx.beginPath();
        [[j, left], [j, right], [j + 1, right], [j + 1, left]].forEach(([sampleIndex, t], i) => {
          const first = sides[1][sampleIndex], second = sides[0][sampleIndex];
          const x = first.x + (second.x - first.x) * t;
          const y = first.y + (second.y - first.y) * t;
          if (i) woodNormals.ctx.lineTo(x, y);
          else woodNormals.ctx.moveTo(x, y);
        });
        woodNormals.ctx.closePath();
        woodNormals.ctx.fill();
      }
    }
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
  const foliageNormals = surface(w, h);
  foliageNormals.ctx.fillStyle = normalColor(0.1, 0.2, -1);
  foliageNormals.ctx.fillRect(0, 0, w, h);
  foliageNormals.ctx.translate(willowLeft, 0);
  paintings[paintings.length - 1].normalMap = foliageNormals.canvas;
  paintings[paintings.length - 1].lightStrength = 0.3;
  paintings[paintings.length - 1].twoSided = true;
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
    willowWind.ctx.lineWidth = 88;
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
      foliageNormals.ctx.fillStyle = normalColor(side * 0.55, 0.3, -0.85);
      for (const leafContext of [ctx, foliageNormals.ctx]) {
        leafContext.beginPath();
        leafContext.moveTo(lx, ly);
        leafContext.quadraticCurveTo(
          lx + side * size * 0.8,
          ly + size * 0.45,
          lx + side * size * 0.55,
          ly + size * 2,
        );
        leafContext.quadraticCurveTo(lx - side, ly + size * 0.4, lx, ly);
        leafContext.fill();
      }
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
export interface FallbackOptions {
  /** Viewport UV: +Y up, radius expressed as a fraction of viewport height. */
  moon: { x: number; y: number; radius: number };
  direction: readonly number[];
  referenceDirection: readonly number[];
  illumination: LightingState;
  air: { x: number; y: number };
  moonSky: { x: number; y: number };
  referenceMoonSky: { x: number; y: number };
  waterWind: readonly number[];
  waterEnergy: number;
  mountainMask: HTMLCanvasElement;
  /** Small displacement in CSS pixels, matching the scene's parallax clock. */
  parallax: { x: number; y: number };
}

type RelightCache = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  colors: Uint8ClampedArray;
  /** Exact linear value of each possible 8-bit source channel, shared by pixels. */
  linearChannel: Float64Array;
  normals: Float32Array;
  normalAlpha: Uint8Array;
  correction: ReturnType<typeof surface>;
  reference: Float32Array;
  referenceKey: string;
  key: string;
};
const fallbackRelighting = new WeakMap<Painting, RelightCache | null>();
const fallbackWater = new WeakMap<Painting, {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  glints: ReturnType<typeof surface>;
  environment: ReturnType<typeof surface>;
}>();
const fallbackMoon = new WeakMap<HTMLCanvasElement, ReturnType<typeof surface>>();
const fallbackMoonRadiance = new WeakMap<Painting, {
  surface: ReturnType<typeof surface>;
  image: ImageData;
  colors: Uint8ClampedArray;
  linearChannel: Float64Array;
  key: string;
} | null>();

/** The compact sprite needs atmospheric airlight, not a diffuse gain. */
function moonFallback(p: Painting, options: FallbackOptions) {
  let cache = fallbackMoonRadiance.get(p);
  if (cache === undefined) {
    try {
      const working = surface(p.canvas.width, p.canvas.height);
      working.ctx.drawImage(p.canvas, 0, 0);
      const image = working.ctx.getImageData(0, 0, p.canvas.width, p.canvas.height);
      if (!image?.data) throw new Error("Pixel data unavailable");
      cache = { surface: working, image, colors: new Uint8ClampedArray(image.data),
        linearChannel: Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255)), key: "" };
    } catch {
      cache = null;
    }
    fallbackMoonRadiance.set(p, cache);
  }
  if (!cache) return p.canvas;
  const { incidentIntensity, ambientGain } = options.illumination;
  const key = `${options.moonSky.y},${options.referenceMoonSky.y},${options.moon.radius},${incidentIntensity},${ambientGain}`;
  if (cache.key === key) return cache.surface.canvas;
  const { width, height } = cache.image;
  for (let y = 0; y < height; y++) {
    const offset = (0.5 - (y + 0.5) / height) * options.moon.radius * 6 / OVERSCAN;
    const sky = sampleSkyBaseColor({ x: 0, y: options.moonSky.y + offset }, ambientGain);
    const reference = sampleSkyBaseColor({ x: 0, y: options.referenceMoonSky.y + offset }, 1);
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      if (!cache.colors[pixel + 3]) continue;
      for (let c = 0; c < 3; c++) {
        cache.image.data[pixel + c] = linearToSrgb(moonRadiance(
          cache.linearChannel[cache.colors[pixel + c]], sky[c], reference[c], incidentIntensity,
        )) * 255;
      }
    }
  }
  cache.surface.ctx.putImageData(cache.image, 0, 0);
  cache.key = key;
  return cache.surface.canvas;
}

/** Cache a modest CPU working image once; dragging never reads full-size textures. */
function relitFallback(p: Painting, options: Pick<FallbackOptions,
  "direction" | "referenceDirection" | "illumination">) {
  let cache = fallbackRelighting.get(p);
  if (cache === undefined) {
    try {
      const scale = Math.min(1, 520 / p.canvas.width, 420 / p.canvas.height);
      const w = Math.max(1, Math.round(p.canvas.width * scale));
      const h = Math.max(1, Math.round(p.canvas.height * scale));
      const correction = surface(w, h);
      correction.ctx.drawImage(p.fallback ?? p.canvas, 0, 0, w, h);
      const source = correction.ctx.getImageData(0, 0, w, h);
      const metadata = surface(w, h);
      if (p.normalMap) metadata.ctx.drawImage(p.normalMap, 0, 0, w, h);
      const packed = metadata.ctx.getImageData(0, 0, w, h);
      if (!source?.data || !packed?.data) throw new Error("Pixel data unavailable");
      const normals = new Float32Array(w * h * 3);
      const normalAlpha = new Uint8Array(w * h);
      const linearChannel = new Float64Array(256);
      for (let value = 0; value < linearChannel.length; value++) {
        linearChannel[value] = srgbToLinear(value / 255);
      }
      for (let i = 0; i < w * h; i++) {
        const x = packed.data[i * 4] / 127.5 - 1;
        const y = packed.data[i * 4 + 1] / 127.5 - 1;
        const z = packed.data[i * 4 + 2] / 127.5 - 1;
        const length = Math.hypot(x, y, z) || 1;
        normals[i * 3] = x / length;
        normals[i * 3 + 1] = y / length;
        normals[i * 3 + 2] = z / length;
        normalAlpha[i] = packed.data[i * 4 + 3];
      }
      cache = {
        ...surface(p.canvas.width, p.canvas.height),
        correction, image: source, colors: new Uint8ClampedArray(source.data),
        linearChannel, normals, normalAlpha, reference: new Float32Array(w * h),
        referenceKey: "", key: "",
      };
      cache.image.data.fill(0);
    } catch {
      // A canvas without pixel readback still retains the complete painted scene.
      cache = null;
    }
    fallbackRelighting.set(p, cache);
  }
  if (!cache) return p.fallback ?? p.canvas;
  const referenceKey = options.referenceDirection.join(",");
  const { directIntensity, ambientGain } = options.illumination;
  const key = `${options.direction.join(",")}:${directIntensity}:${ambientGain}:${referenceKey}`;
  if (cache.key === key) return cache.canvas;
  const strength = p.lightStrength ?? 0;
  const direction = options.direction, reference = options.referenceDirection;
  for (let i = 0; i < cache.reference.length; i++) {
    const pixel = i * 4, n = i * 3;
    if (!cache.colors[pixel + 3]) continue;
    const x = cache.normals[n], y = cache.normals[n + 1], z = cache.normals[n + 2];
    if (cache.referenceKey !== referenceKey) {
      cache.reference[i] = lightResponse(x, y, z, reference, p.twoSided);
    }
    const response = lightResponse(x, y, z, direction, p.twoSided);
    const gain = cache.normalAlpha[i]
      ? lightingGain(response, cache.reference[i], directIntensity, strength, ambientGain) : ambientGain;
    // A low-resolution light correction sits atop the original full-resolution
    // paint. Darkening preserves every brush mark, and brighter planes retain
    // their high-frequency detail instead of replacing it with a small bitmap.
    const red = cache.colors[pixel], green = cache.colors[pixel + 1], blue = cache.colors[pixel + 2];
    const baseR = red / 255, baseG = green / 255, baseB = blue / 255;
    const litR = Math.min(1, linearToSrgb(cache.linearChannel[red] * gain));
    const litG = Math.min(1, linearToSrgb(cache.linearChannel[green] * gain));
    const litB = Math.min(1, linearToSrgb(cache.linearChannel[blue] * gain));
    const opacity = gain <= 1
      ? Math.max(0, (baseR - litR) / Math.max(baseR, 0.0001),
        (baseG - litG) / Math.max(baseG, 0.0001), (baseB - litB) / Math.max(baseB, 0.0001))
      : Math.max(0, (litR - baseR) / Math.max(1 - baseR, 0.0001),
        (litG - baseG) / Math.max(1 - baseG, 0.0001), (litB - baseB) / Math.max(1 - baseB, 0.0001));
    const denominator = Math.max(opacity, 0.0001);
    cache.image.data[pixel] = (baseR + (litR - baseR) / denominator) * 255;
    cache.image.data[pixel + 1] = (baseG + (litG - baseG) / denominator) * 255;
    cache.image.data[pixel + 2] = (baseB + (litB - baseB) / denominator) * 255;
    cache.image.data[pixel + 3] = opacity * 255;
  }
  cache.referenceKey = referenceKey;
  cache.key = key;
  cache.correction.ctx.putImageData(cache.image, 0, 0);
  cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
  cache.ctx.drawImage(p.fallback ?? p.canvas, 0, 0);
  cache.ctx.save();
  cache.ctx.globalCompositeOperation = "source-atop";
  cache.ctx.drawImage(cache.correction.canvas, 0, 0, cache.canvas.width, cache.canvas.height);
  cache.ctx.restore();
  return cache.canvas;
}

function reflectedFallback(
  p: Painting,
  options: FallbackOptions,
  shadowOffset: { x: number; y: number },
) {
  const w = p.canvas.width, h = p.canvas.height;
  let working = fallbackWater.get(p);
  if (!working) {
    working = { ...surface(w, h), glints: surface(w, h), environment: surface(180, Math.max(1, Math.round(180 * h / w))) };
    fallbackWater.set(p, working);
  }
  const { ctx, glints, environment } = working;
  const { illumination: light, air, moonSky, waterWind, waterEnergy } = options;
  const source = { direction: light.sourceDirection, tangentX: light.tangentX,
    tangentY: light.tangentY, covariance: light.covariance };
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(relitFallback(p, options), 0, 0);
  // Static flat-water limit of the reflected environment; retain the painted ripples.
  const ew = environment.canvas.width, eh = environment.canvas.height;
  const image = environment.ctx.createImageData(ew, eh);
  for (let py = 0; py < eh; py++) {
    const y = 1 - (py + 0.5) / eh, below = WATER_HORIZON - y;
    if (below <= 0) continue;
    for (let px = 0; px < ew; px++) {
      const x = (px + 0.5) / ew;
      const vx = -(x - 0.5) * w / h, length = Math.hypot(vx, below, 1);
      const fresnel = 0.02 + 0.98 * (1 - below / length) ** 5;
      const sky = sampleSkyColor({ x: x + 3 * shadowOffset.x / w,
        y: WATER_HORIZON + below - 3 * shadowOffset.y / h },
      w / h, air, moonSky, light.incidentIntensity, light.ambientGain);
      const pixel = (py * ew + px) * 4;
      for (let c = 0; c < 3; c++) image.data[pixel + c] = linearToSrgb(sky[c]) * 255;
      image.data[pixel + 3] = fresnel * 0.28 * Math.min(1, below / 0.065) * 255;
    }
  }
  environment.ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(environment.canvas, 0, 0, w, h);
  ctx.restore();
  // The flat-water limit of the shader's half-vector model. Moving the moon
  // vertically changes the glint's depth instead of leaving a fixed bright strip.
  glints.ctx.clearRect(0, 0, w, h);
  const random = seeded(811);
  for (let i = 0; i < 2400; i++) {
    const x = random(), y = random() * WATER_HORIZON;
    const length = 1 + random() * w * 0.017 * (1 - y / WATER_HORIZON);
    const grain = random();
    const vx = -(x - 0.5) * w / h, vy = WATER_HORIZON - y;
    const distance = Math.hypot(vx, vy, 1);
    const glow = waterSpecular([vx / distance, vy / distance, -1 / distance],
      [0, 1, 0], source, waterWind, waterEnergy) * WATER_EXPOSURE;
    const fade = Math.min(1, (WATER_HORIZON - y) / 0.065);
    const alpha = Math.min(0.55, glow * light.directIntensity * fade * (0.7 + grain * 0.6));
    if (alpha < 0.001) continue;
    glints.ctx.fillStyle = `rgba(240,224,180,${alpha})`;
    glints.ctx.fillRect(x * w, (1 - y) * h, length, 0.5 + fade);
  }
  if (p.shadowMap) {
    glints.ctx.save();
    glints.ctx.globalCompositeOperation = "destination-out";
    glints.ctx.globalAlpha = 1;
    glints.ctx.drawImage(p.shadowMap, shadowOffset.x, shadowOffset.y, w, h);
    glints.ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 1;
  ctx.drawImage(glints.canvas, 0, 0);
  ctx.restore();
  return working.canvas;
}

type AtmosphereCache = {
  sky: ReturnType<typeof surface>;
  clouds: ReturnType<typeof surface>;
  depths: Float32Array;
  key: string;
};
const fallbackAtmosphere = new WeakMap<HTMLCanvasElement, AtmosphereCache>();

/** Frozen weather; cache its density and recolor only when moon/light changes. */
function fallbackSky(canvas: HTMLCanvasElement, options: FallbackOptions) {
  const { width, height } = canvas;
  const scale = Math.min(1, 280 / width, 220 / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  let cache = fallbackAtmosphere.get(canvas);
  if (!cache || cache.sky.canvas.width !== w || cache.sky.canvas.height !== h) {
    cache = { sky: surface(w, h), clouds: surface(w, h), depths: new Float32Array(w * h * 2), key: "" };
    fallbackAtmosphere.set(canvas, cache);
  }
  const key = `${width},${height},${options.air.x},${options.air.y}`;
  const sky = cache.sky.ctx.createImageData(w, h), clouds = cache.clouds.ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const uv = { x: 0, y: 0.5 + (0.5 - (y + 0.5) / h) / OVERSCAN };
    const base = sampleSkyBaseColor(uv, options.illumination.ambientGain);
    const rowR = linearToSrgb(base[0]) * 255, rowG = linearToSrgb(base[1]) * 255,
      rowB = linearToSrgb(base[2]) * 255;
    for (let x = 0; x < w; x++) {
      uv.x = 0.5 + ((x + 0.5) / w - 0.5) / OVERSCAN;
      const i = y * w + x;
      if (cache.key !== key) cache.depths.set(cloudOpticalDepth(uv, width / height, options.air), i * 2);
      const cloud = sampleCloudColor(uv, width / height, options.air, options.moonSky,
        options.illumination.incidentIntensity, options.illumination.ambientGain,
        [cache.depths[i * 2], cache.depths[i * 2 + 1]]);
      sky.data[i * 4] = rowR;
      sky.data[i * 4 + 1] = rowG;
      sky.data[i * 4 + 2] = rowB;
      sky.data[i * 4 + 3] = 255;
      for (let c = 0; c < 3; c++) clouds.data[i * 4 + c] = linearToSrgb(cloud[c]) * 255;
      clouds.data[i * 4 + 3] = cloud[3] * 255;
    }
  }
  cache.key = key;
  cache.sky.ctx.putImageData(sky, 0, 0);
  cache.clouds.ctx.putImageData(clouds, 0, 0);
  return cache;
}

export function drawFallback(
  canvas: HTMLCanvasElement,
  paintings: Painting[],
  options?: FallbackOptions,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const defaultMoon = moonPosition(w, h);
  const light = [(defaultMoon.x - 0.5) * w / h, defaultMoon.y - WATER_HORIZON, 1];
  const magnitude = Math.hypot(...light);
  const defaultDirection = light.map((component) => component / magnitude);
  const direction = options?.direction ?? defaultDirection;
  const referenceDirection = options?.referenceDirection ?? defaultDirection;
  const parallax = options?.parallax ?? { x: 0, y: 0 };
  const moon = options?.moon ?? {
    x: 0.5 + (defaultMoon.x - 0.5) * OVERSCAN,
    y: 0.5 + (defaultMoon.y - 0.5) * OVERSCAN,
    radius: defaultMoon.radius * OVERSCAN,
  };
  const air = options?.air ?? { x: 0, y: 0 };
  const moonSky = options?.moonSky ?? { x: defaultMoon.x, y: defaultMoon.y };
  const referenceMoonSky = options?.referenceMoonSky ?? {
    x: defaultMoon.x + parallax.x * 2 / (w * OVERSCAN),
    y: defaultMoon.y - parallax.y * 2 / (h * OVERSCAN),
  };
  const illumination = options?.illumination ?? sampleLighting(defaultMoon,
    paintings.filter((p) => p.ridge).map((p) => ({ points: p.ridge!, depth: p.depth })),
    w, h, parallax, (uv) => cloudTransmission(uv, w / h, air));
  const settings: FallbackOptions = { moon, direction, referenceDirection, parallax,
    illumination, air, moonSky, referenceMoonSky, waterWind: options?.waterWind ?? [1, 0], waterEnergy: options?.waterEnergy ?? 1,
    mountainMask: options?.mountainMask ?? document.createElement("canvas") };
  const atmosphere = fallbackSky(canvas, settings);
  ctx.drawImage(atmosphere.sky.canvas, 0, 0, w, h);
  paintings.forEach((p) => {
    if (p.kind === "moon") {
      let working = fallbackMoon.get(canvas);
      if (!working || working.canvas.width !== w || working.canvas.height !== h) {
        working = surface(w, h);
        fallbackMoon.set(canvas, working);
      }
      working.ctx.clearRect(0, 0, w, h);
      const radius = moon.radius * h;
      const litMoon = moonFallback(p, settings);
      working.ctx.drawImage(litMoon, moon.x * w - radius * 3,
        (1 - moon.y) * h - radius * 3, radius * 6, radius * 6);
      if (options?.mountainMask) {
        working.ctx.save();
        working.ctx.globalCompositeOperation = "destination-out";
        working.ctx.drawImage(options.mountainMask, 0, 0, w, h);
        working.ctx.restore();
      }
      ctx.drawImage(working.canvas, 0, 0);
      ctx.drawImage(atmosphere.clouds.canvas, 0, 0, w, h);
      return;
    }
    const layer = p.kind === "water"
      ? reflectedFallback(p, settings, {
        x: parallax.x * p.canvas.width / (w * OVERSCAN),
        y: parallax.y * p.canvas.height / (h * OVERSCAN),
      })
      : relitFallback(p, settings);
    ctx.drawImage(layer, -w * (OVERSCAN - 1) / 2 + parallax.x * p.depth,
      -h * (OVERSCAN - 1) / 2 + parallax.y * p.depth, w * OVERSCAN, h * OVERSCAN);
  });
}
