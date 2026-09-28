import { paintBanks } from "./banks";
import { paintBridge, paintBridgeWaterShadow } from "./bridge";
import { normalColor } from "./lighting";

function recordingContext() {
  const commands: unknown[][] = [];
  const styles: unknown[] = [];
  const target: Record<string, unknown> = { fillStyle: "#000" };
  for (const method of [
    "beginPath", "closePath", "moveTo", "lineTo", "bezierCurveTo",
    "quadraticCurveTo", "stroke", "fillRect", "save", "restore", "clip",
    "ellipse", "clearRect", "drawImage",
  ]) {
    target[method] = (...args: unknown[]) => commands.push([method, ...args]);
  }
  target.fill = () => {
    commands.push(["fill", target.fillStyle]);
    styles.push(target.fillStyle);
  };
  target.createLinearGradient = (...args: unknown[]) => {
    const gradient = {
      stops: [] as unknown[][],
      addColorStop(offset: number, color: string) {
        this.stops.push([offset, color]);
      },
    };
    commands.push(["gradient", ...args, gradient.stops]);
    return gradient;
  };
  const ctx = new Proxy(target, {
    set(object, property, value) {
      commands.push([String(property), value]);
      object[String(property)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, commands, styles };
}

function randomSource() {
  let state = 127;
  return jest.fn(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  });
}

test.each(["bridge", "banks"])(
  "%s normal metadata preserves all original artwork and random consumption",
  (material) => {
    const before = recordingContext(), after = recordingContext();
    const contactBefore = recordingContext(), contactAfter = recordingContext();
    const normals = recordingContext();
    const originalRandom = randomSource(), metadataRandom = randomSource();
    if (material === "bridge") {
      paintBridge(before.ctx, 1440, 900, originalRandom);
      paintBridge(after.ctx, 1440, 900, metadataRandom, normals.ctx);
      expect(normals.styles).toContain(normalColor(0, 1, 0));
      // The vault's underside differs from its upward treads and coping.
      expect(normals.styles.some((style) => {
        const rgb = String(style).match(/^rgb\((\d+),(\d+),(\d+)\)$/);
        return rgb && Number(rgb[2]) < 30;
      })).toBe(true);
    } else {
      paintBanks(before.ctx, contactBefore.ctx, 1440, 900, originalRandom);
      paintBanks(after.ctx, contactAfter.ctx, 1440, 900, metadataRandom, normals.ctx);
      expect(normals.styles).toContain(normalColor(-0.2, 0.94, -0.27));
      expect(normals.styles).toContain(normalColor(0.05, 0.3, -0.95));
    }
    expect(metadataRandom.mock.calls.length).toBe(originalRandom.mock.calls.length);
    // Gradient methods have different function identities; compare their stops
    // and all draw arguments without treating those mock functions as artwork.
    expect(after.commands.length).toBe(before.commands.length);
    expect(after.commands.findIndex((command, index) =>
      JSON.stringify(command) !== JSON.stringify(before.commands[index]),
    )).toBe(-1);
    expect(JSON.stringify(contactAfter.commands)).toBe(JSON.stringify(contactBefore.commands));
    expect(normals.styles.length).toBeGreaterThan(8);
  },
);

test("dynamic water shadows clear previous light and reuse scratch resources", () => {
  const output = recordingContext(), scratch = recordingContext();
  const createElement = jest.spyOn(document, "createElement");
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(scratch.ctx as never);
  try {
    paintBridgeWaterShadow(output.ctx, 1440, 900, [0.4, 0.5, 1]);
    const canvasCount = () => createElement.mock.calls.filter(([tag]) => tag === "canvas").length;
    expect(canvasCount()).toBe(1);
    const first = scratch.commands.filter(([method]) => method === "moveTo" || method === "lineTo");
    scratch.commands.length = 0;
    paintBridgeWaterShadow(output.ctx, 1440, 900, [-0.4, 0.5, 1]);
    const second = scratch.commands.filter(([method]) => method === "moveTo" || method === "lineTo");
    expect(canvasCount()).toBe(1);
    expect(second).not.toEqual(first);
    expect(output.commands.filter(([method]) => method === "clearRect")).toHaveLength(2);
    expect(output.commands.filter(([method]) => method === "drawImage")).toHaveLength(2);
    paintBridgeWaterShadow(output.ctx, 1440, 900, [0, 0, 1]);
    expect(output.commands.filter(([method]) => method === "clearRect")).toHaveLength(3);
    expect(output.commands.filter(([method]) => method === "drawImage")).toHaveLength(2);
    paintBridgeWaterShadow(output.ctx, 390, 844, [0.4, 0.5, 1]);
    expect(canvasCount()).toBe(2);
  } finally {
    getContext.mockRestore();
    createElement.mockRestore();
  }
});
