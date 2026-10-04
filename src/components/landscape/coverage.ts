/** Painting pixels per coverage cell. */
export const COVERAGE_CELL = 16;

/** Normalized UV rectangle with Y pointing up, matching shader `vUv`. */
export interface UvRect { x0: number; y0: number; x1: number; y1: number }

/**
 * Coarse occupancy of one layer. `data` holds one byte per cell (255 where the
 * layer must be shaded), rows from the bottom so it uploads with flipY=false.
 */
export interface Coverage {
  columns: number;
  rows: number;
  data: Uint8Array;
  /** Shaded cells' bounds, or null when nothing of the layer can be seen. */
  bounds: UvRect | null;
}

export interface CellRequest {
  /** Every canvas whose alpha can make this layer visible. */
  sources: HTMLCanvasElement[];
  /** Also find cells this layer covers completely, hiding layers beneath it. */
  occluder?: boolean;
}

/** Cell masks in canvas row order (top first): 1 where the condition holds. */
export interface LayerCells { occupied: Uint8Array; opaque: Uint8Array | null }

function scratch(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") };
}

/**
 * Finds occupied and fully opaque cells for each layer with one readback.
 * Each level halves the image with nine offset bilinear draws added together;
 * every source pixel keeps at least its own weight, so faint strokes survive
 * down to the coarse grid. Opacity pools the inverted alpha the same way.
 */
export function measureCells(width: number, height: number, requests: CellRequest[]) {
  const levels = Math.round(Math.log2(COVERAGE_CELL));
  const columns = Math.max(1, Math.ceil(width / COVERAGE_CELL));
  const rows = Math.max(1, Math.ceil(height / COVERAGE_CELL));
  const sizes: [number, number][] = [];
  for (let level = 1; level <= levels; level++) {
    sizes.push([Math.max(1, Math.ceil(width / 2 ** level)), Math.max(1, Math.ceil(height / 2 ** level))]);
  }
  const slots = requests.map((request) => request.occluder ? 2 : 1);
  const offsets = slots.map((_, i) => slots.slice(0, i).reduce((sum, n) => sum + n, 0));
  const stages = sizes.slice(0, -1).map(([w, h]) => scratch(w, h));
  // A two-cell gutter keeps half-pixel offset draws from bleeding between slots.
  const stride = columns + 2;
  const atlas = scratch(stride * Math.max(1, slots.reduce((sum, n) => sum + n, 0)), rows);
  const inverse = requests.some((request) => request.occluder) ? scratch(width, height) : undefined;
  const release = () => stages.concat(atlas, inverse ? [inverse] : []).forEach(({ canvas }) => {
    canvas.width = canvas.height = 0;
  });
  if (!atlas.ctx || stages.some((stage) => !stage.ctx) || (inverse && !inverse.ctx)) {
    release();
    return {
      columns, rows,
      layers: requests.map(() => ({ occupied: new Uint8Array(columns * rows).fill(1), opaque: null })),
    };
  }
  atlas.ctx.globalCompositeOperation = "lighter";
  const halve = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number,
    target: CanvasRenderingContext2D, x: number, targetWidth: number, targetHeight: number) => {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        target.drawImage(source, 0, 0, sourceWidth, sourceHeight,
          x + ox * 0.5, oy * 0.5, targetWidth, targetHeight);
      }
    }
  };
  const pool = (source: HTMLCanvasElement, slot: number) => {
    let current: CanvasImageSource = source, currentWidth = source.width, currentHeight = source.height;
    if (!currentWidth || !currentHeight) return;
    stages.forEach(({ canvas, ctx }, level) => {
      const [w, h] = sizes[level];
      ctx!.globalCompositeOperation = "source-over";
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.globalCompositeOperation = "lighter";
      halve(current, currentWidth, currentHeight, ctx!, 0, w, h);
      current = canvas;
      currentWidth = w;
      currentHeight = h;
    });
    const [w, h] = sizes[sizes.length - 1];
    halve(current, currentWidth, currentHeight, atlas.ctx!, slot * stride, w, h);
  };
  requests.forEach(({ sources, occluder }, index) => {
    sources.forEach((source) => pool(source, offsets[index]));
    if (!occluder || !inverse) return;
    // Transparency = 1 − alpha; a cell is opaque when no pixel lets light through.
    const ctx = inverse.ctx!;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(sources[0], 0, 0, width, height);
    pool(inverse.canvas, offsets[index] + 1);
  });
  const atlasWidth = atlas.canvas.width;
  const pixels = atlas.ctx.getImageData(0, 0, atlasWidth, rows).data;
  release();
  const read = (slot: number, test: (alpha: number) => boolean) => {
    const cells = new Uint8Array(columns * rows);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (test(pixels[(row * atlasWidth + slot * stride + column) * 4 + 3])) cells[row * columns + column] = 1;
      }
    }
    return cells;
  };
  return {
    columns, rows,
    layers: requests.map(({ occluder }, index): LayerCells => ({
      occupied: read(offsets[index], (alpha) => alpha > 0),
      opaque: occluder ? read(offsets[index] + 1, (alpha) => alpha === 0) : null,
    })),
  };
}

/** Grows (radius > 0) or shrinks (radius < 0) a canvas-ordered cell mask. */
export function morph(cells: Uint8Array, columns: number, rows: number, radius: number) {
  const out = new Uint8Array(cells.length), grow = radius > 0, r = Math.abs(radius);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let value = grow ? 0 : 1;
      for (let y = row - r; y <= row + r; y++) {
        for (let x = column - r; x <= column + r; x++) {
          // Shrinking treats the canvas border as transparent.
          const inside = y >= 0 && y < rows && x >= 0 && x < columns;
          const cell = inside ? cells[y * columns + x] : 0;
          if (grow ? cell : !cell) value = grow ? 1 : 0;
        }
      }
      out[row * columns + column] = value;
    }
  }
  return out;
}

/**
 * Cells to shade: occupied ones grown by `dilation`, minus `hidden` cells that
 * a later opaque layer covers. Flipped bottom-up for upload, with bounds.
 */
export function toCoverage(occupied: Uint8Array, columns: number, rows: number,
  dilation: number, hidden?: Uint8Array): Coverage {
  const grown = dilation ? morph(occupied, columns, rows, dilation) : occupied;
  const data = new Uint8Array(columns * rows);
  let minColumn = columns, maxColumn = -1, minRow = rows, maxRow = -1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const i = row * columns + column;
      if (!grown[i] || hidden?.[i]) continue;
      data[(rows - 1 - row) * columns + column] = 255;
      minColumn = Math.min(minColumn, column); maxColumn = Math.max(maxColumn, column);
      minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
    }
  }
  return {
    columns, rows, data,
    bounds: maxColumn < 0 ? null : {
      x0: minColumn / columns,
      x1: Math.min(1, (maxColumn + 1) / columns),
      y0: Math.max(0, 1 - (maxRow + 1) / rows),
      y1: 1 - minRow / rows,
    },
  };
}

/** Canvas-ordered cells inside a UV rectangle. */
export function rectCells({ x0, y0, x1, y1 }: UvRect, columns: number, rows: number) {
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const top = 1 - row / rows, bottom = 1 - (row + 1) / rows;
    if (bottom >= y1 || top <= y0) continue;
    for (let column = 0; column < columns; column++) {
      if ((column + 1) / columns > x0 && column / columns < x1) cells[row * columns + column] = 1;
    }
  }
  return cells;
}

/**
 * Returns, for a draw order, the cells that later opaque layers cover. Opaque
 * cells shrink by one cell first, beyond the few pixels of relative parallax
 * between layers, so a moving foreground never uncovers an unshaded cell.
 */
export function occlusion(layers: { order: number; opaque: Uint8Array | null }[], columns: number, rows: number) {
  const eroded = layers.map(({ order, opaque }) => ({ order, cells: opaque && morph(opaque, columns, rows, -1) }));
  return (order: number) => {
    const hidden = new Uint8Array(columns * rows);
    eroded.forEach(({ order: layer, cells }) => {
      if (layer > order && cells) cells.forEach((cell, i) => { hidden[i] |= cell; });
    });
    return hidden;
  };
}
