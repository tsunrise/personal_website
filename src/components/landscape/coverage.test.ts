import { measureCells, morph, occlusion, rectCells, toCoverage } from "./coverage";

// Canvas-ordered (top row first) masks from strings, for readable fixtures.
const grid = (...rows: string[]) => Uint8Array.from(rows.join("").split(""), (c) => (c === "#" ? 1 : 0));
const draw = (cells: Uint8Array, columns: number) =>
  Array.from({ length: cells.length / columns }, (_, row) =>
    Array.from(cells.slice(row * columns, (row + 1) * columns), (c) => (c ? "#" : ".")).join(""));

test("morph grows and shrinks masks, treating the border as transparent", () => {
  const cells = grid(
    "......",
    ".###..",
    ".###..",
    ".###..",
  );
  expect(draw(morph(cells, 6, 4, 1), 6)).toEqual(["#####.", "#####.", "#####.", "#####."]);
  expect(draw(morph(cells, 6, 4, -1), 6)).toEqual(["......", "......", "..#...", "......"]);
  // A full mask touching the border loses its edge cells when shrunk.
  expect(draw(morph(new Uint8Array(9).fill(1), 3, 3, -1), 3)).toEqual(["...", ".#.", "..."]);
});

test("coverage flips rows for upload, subtracts hidden cells, and reports bounds", () => {
  const occupied = grid(
    "....",
    ".#..",
    "....",
  );
  const hidden = grid(
    "....",
    "....",
    "..#.",
  );
  const { data, bounds } = toCoverage(occupied, 4, 3, 1, hidden);
  // Bottom canvas row is uploaded first.
  expect(Array.from(data.slice(0, 4))).toEqual([255, 255, 0, 0]);
  expect(Array.from(data.slice(8, 12))).toEqual([255, 255, 255, 0]);
  expect(bounds).toEqual({ x0: 0, x1: 0.75, y0: 0, y1: 1 });
  expect(toCoverage(new Uint8Array(12), 4, 3, 2).bounds).toBeNull();
});

test("rectangles map UV with Y up onto canvas-ordered cells", () => {
  expect(draw(rectCells({ x0: 0.5, y0: 0.5, x1: 1, y1: 1 }, 4, 4), 4)).toEqual(["..##", "..##", "....", "...."]);
  expect(draw(rectCells({ x0: 0, y0: 0.18, x1: 1, y1: 0.5 }, 2, 10), 2)).toEqual(
    ["..", "..", "..", "..", "..", "##", "##", "##", "##", ".."]);
});

test("only later opaque layers hide cells, after eroding their parallax margin", () => {
  const opaque = grid(
    "#####",
    "#####",
    "#####",
  );
  const hiddenBelow = occlusion([
    { order: 2, opaque },
    { order: 5, opaque: null },
    { order: 7, opaque },
  ], 5, 3);
  expect(draw(hiddenBelow(1), 5)).toEqual([".....", ".###.", "....."]);
  expect(draw(hiddenBelow(5), 5)).toEqual([".....", ".###.", "....."]);
  expect(draw(hiddenBelow(7), 5)).toEqual([".....", ".....", "....."]);
});

test("without a 2D canvas every cell stays shaded", () => {
  const source = document.createElement("canvas");
  source.width = 64;
  source.height = 32;
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const { columns, rows, layers } = measureCells(64, 32, [{ sources: [source], occluder: true }]);
  expect([columns, rows]).toEqual([4, 2]);
  expect(Array.from(layers[0].occupied)).toEqual(new Array(8).fill(1));
  expect(layers[0].opaque).toBeNull();
  getContext.mockRestore();
});
