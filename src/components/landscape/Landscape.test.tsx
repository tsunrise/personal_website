import { act, fireEvent, render } from "@testing-library/react";
import * as THREE from "three";
import Landscape from "./Landscape";
import { moonPosition } from "./composition";
import { screenMoon } from "./moon";

let mockFailRenderer = false;
let mockRenderer: any;
jest.mock("three", () => ({ ...jest.requireActual("three"), WebGLRenderer: jest.fn() }));
let frame: FrameRequestCallback;
let mockObserver: ResizeObserverCallback;
let now: number;
const disconnect = jest.fn(), drawImage = jest.fn();
const capture = jest.fn(), releaseCapture = jest.fn();

function tick(milliseconds = 50) {
  now += milliseconds;
  act(() => frame(now));
}
function pointer(target: Window | Document | HTMLElement, type: string, props: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries({ pointerId: 1, pointerType: "mouse", button: 0, isPrimary: true, ...props })
    .forEach(([name, value]) => Object.defineProperty(event, name, { value }));
  fireEvent(target, event);
}
function touch(type: string, touches: { clientX: number; clientY: number }[]) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(false);
}
function position(button: HTMLElement) {
  return { x: parseFloat(button.style.left), y: parseFloat(button.style.top) };
}
function expectPosition(button: HTMLElement, x: number, y: number) {
  expect(position(button).x).toBeCloseTo(x);
  expect(position(button).y).toBeCloseTo(y);
}
function dragTo(button: HTMLElement, x: number, y: number, pointerType = "mouse") {
  const start = position(button);
  pointer(button, "pointerdown", { clientX: start.x, clientY: start.y, pointerType });
  pointer(window, "pointermove", { clientX: x, clientY: y, pointerType });
  tick();
  pointer(window, "pointerup", { pointerType });
}
function materials() {
  const scene = mockRenderer.compile.mock.calls[0][0] as THREE.Scene;
  return scene.children.map((child) => (child as THREE.Mesh).material as THREE.ShaderMaterial)
    .filter((material) => material?.uniforms?.uAirOffset);
}
function fakeResizeTimers() {
  const request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
  jest.useFakeTimers();
  window.requestAnimationFrame = request;
  window.cancelAnimationFrame = cancel;
}
function resize() {
  act(() => { mockObserver([], {} as ResizeObserver); jest.advanceTimersByTime(200); });
}

beforeEach(() => {
  now = 100;
  mockFailRenderer = false;
  jest.clearAllMocks();
  (THREE.WebGLRenderer as unknown as jest.Mock).mockImplementation(() => {
    if (mockFailRenderer) throw new Error("No WebGL");
    mockRenderer = {
      domElement: document.createElement("canvas"), setSize: jest.fn(),
      setPixelRatio: jest.fn(), render: jest.fn(), compile: jest.fn(), dispose: jest.fn(),
    };
    return mockRenderer;
  });
  const contexts = new WeakMap<HTMLCanvasElement, object>();
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, new Proxy({ canvas: this, drawImage }, {
      get: (target, key) => {
        if (key in target) return target[key as keyof typeof target];
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop: () => {} });
        if (key === "getImageData" || key === "createImageData") return (...args: number[]) => {
          const width = args.length === 4 ? args[2] : args[0], height = args.length === 4 ? args[3] : args[1];
          return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        };
        return () => {};
      },
    }));
    return contexts.get(this) as any;
  });
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800, height: 600, x: 0, y: 0, top: 0, left: 0,
    right: 800, bottom: 600, toJSON: () => ({}),
  });
  const captured = new WeakMap<HTMLElement, number>();
  capture.mockImplementation(function (this: HTMLElement, id: number) { captured.set(this, id); });
  releaseCapture.mockImplementation(function (this: HTMLElement) { captured.delete(this); });
  HTMLElement.prototype.setPointerCapture = capture;
  HTMLElement.prototype.releasePointerCapture = releaseCapture;
  HTMLElement.prototype.hasPointerCapture = function (id) { return captured.get(this) === id; };
  window.matchMedia = jest.fn().mockReturnValue({ matches: true });
  window.requestAnimationFrame = jest.fn((callback) => { frame = callback; return 1; });
  window.cancelAnimationFrame = jest.fn();
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    mockObserver = callback;
    return { observe: jest.fn(), disconnect };
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("frames are throttled, rerenders retain the scene, and cleanup releases textures and capture", () => {
  const { rerender, unmount, getByRole } = render(<Landscape />);
  tick(); tick(16);
  expect(mockRenderer.render).toHaveBeenCalledTimes(1);
  rerender(<Landscape />);
  tick(24);
  expect(mockRenderer.render).toHaveBeenCalledTimes(2);
  expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
  expect(materials().filter((m) => m.uniforms.uWindMap).map((m) => m.uniforms.uKind.value).sort()).toEqual([2, 3]);
  const textures = new Set<THREE.Texture>();
  materials().forEach((material) => Object.values(material.uniforms).forEach(({ value }) => {
    if (value instanceof THREE.Texture) textures.add(value);
  }));
  expect(textures.size).toBeGreaterThan(15);
  const disposals = Array.from(textures).map((texture) => jest.spyOn(texture, "dispose"));
  const button = getByRole("button", { name: "Move moon" });
  pointer(button, "pointerdown", { clientX: position(button).x, clientY: position(button).y });
  unmount();
  disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  expect(releaseCapture).toHaveBeenCalledWith(1);
  expect(disconnect).toHaveBeenCalled();
  expect(mockRenderer.dispose).toHaveBeenCalledTimes(1);
  expect(window.cancelAnimationFrame).toHaveBeenCalled();
});

test("shared weather and lighting survive hidden tabs and resize without catching up", () => {
  fakeResizeTimers();
  const { unmount } = render(<Landscape />);
  tick(); tick();
  const uniforms = materials()[0].uniforms;
  const snapshot = () => {
    const u = materials()[0].uniforms;
    return [u.uTime.value, u.uWaterEnergy.value, ...u.uAirOffset.value.toArray(),
      ...u.uWillow.value.toArray(), ...u.uReeds.value.toArray(), ...u.uWaveBasis.value.toArray()];
  };
  materials().forEach((material) => {
    ["uAirOffset", "uWaveBasis", "uMoon", "uLightDirection", "uMoonVisibility"].forEach((key) =>
      expect(material.uniforms[key]).toBe(uniforms[key]));
  });
  const stopped = snapshot(), renders = mockRenderer.render.mock.calls.length;
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  tick(20000); resize(); tick();
  expect(snapshot()).toEqual(stopped);
  expect(mockRenderer.render).toHaveBeenCalledTimes(renders);
  expect(materials()[0].uniforms.uAirOffset).toBe(uniforms.uAirOffset);
  expect(materials()[0].uniforms.uLightDirection).toBe(uniforms.uLightDirection);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  tick(20000);
  expect(snapshot()).toEqual(stopped);
  tick();
  expect(snapshot()[0] - stopped[0]).toBeCloseTo(0.05);
  expect(snapshot().slice(2, 4)).not.toEqual(stopped.slice(2, 4));
  unmount();
});

test.each(["mouse", "touch"])("%s dragging retains grab offset and respects pointer capture and the 6px threshold", (pointerType) => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: pointerType === "mouse" });
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" }), start = position(button);
  tick();
  const shadow = materials().find((material) => material.uniforms.uShadowMap)!.uniforms.uShadowMap.value as THREE.Texture;
  const shadowVersion = shadow.version;
  pointer(button, "pointerdown", { clientX: start.x + 9, clientY: start.y - 4, pointerType });
  expect(capture).toHaveBeenCalledWith(1);
  pointer(window, "pointermove", { clientX: start.x + 15, clientY: start.y - 4, pointerType });
  tick();
  expect(position(button)).toEqual(start);
  pointer(window, "pointermove", { pointerId: 2, clientX: 100, clientY: 200, pointerType });
  tick();
  expect(position(button)).toEqual(start);
  pointer(window, "pointermove", { clientX: 259, clientY: 126, pointerType });
  tick();
  expect(position(button).x).toBeCloseTo(250);
  expect(position(button).y).toBeCloseTo(130);
  const lights = materials().map((m) => m.uniforms.uLightDirection);
  expect(lights[0].value.x).toBeLessThan(0);
  lights.forEach((light) => expect(light).toBe(lights[0]));
  expect(shadow.version).toBeGreaterThan(shadowVersion);
  pointer(window, "pointerup", { pointerType });
  expect(releaseCapture).toHaveBeenCalledWith(1);
  expect(button).toHaveAttribute("data-dragging", "false");
});

test("portrait resize preserves a moved moon, updates its radius, and releases an active drag", () => {
  fakeResizeTimers();
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" });
  tick(); dragTo(button, 250, 130);
  const diameter = parseFloat(button.style.width);
  pointer(button, "pointerdown", { clientX: 250, clientY: 130 });
  (HTMLElement.prototype.getBoundingClientRect as jest.Mock).mockReturnValue({
    width: 390, height: 844, x: 0, y: 0, top: 0, left: 0,
    right: 390, bottom: 844, toJSON: () => ({}),
  });
  resize();
  expectPosition(button, 250 / 800 * 390, 130 / 600 * 844);
  expect(parseFloat(button.style.width)).not.toBeCloseTo(diameter);
  expect(button).toHaveAttribute("data-dragging", "false");
  expect(releaseCapture).toHaveBeenLastCalledWith(1);
});

test.each(["pointercancel", "multitouch", "second touch pointer", "blur"])("%s ends dragging without consuming native touch gestures", (method) => {
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" }), start = position(button);
  pointer(button, "pointerdown", { clientX: start.x, clientY: start.y, pointerType: "touch" });
  if (method === "pointercancel") pointer(window, method, { pointerType: "touch" });
  else if (method === "second touch pointer") pointer(window, "pointerdown", { pointerId: 2, pointerType: "touch", isPrimary: false });
  else if (method === "blur") fireEvent(window, new Event("blur"));
  else touch("touchstart", [{ clientX: start.x, clientY: start.y }, { clientX: 400, clientY: 300 }]);
  expect(releaseCapture).toHaveBeenCalledWith(1);
  expect(button).toHaveAttribute("data-dragging", "false");
  pointer(window, "pointermove", { clientX: 200, clientY: 150, pointerType: "touch" });
  tick();
  expect(position(button)).toEqual(start);
});

test("only hidden moon clicks reset; the drag-ending click is suppressed and return is smooth", () => {
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" });
  tick();
  dragTo(button, 250, 130);
  fireEvent.click(button, { detail: 1 }); // The browser delivers a click after releasing a drag.
  fireEvent.click(button); // Visible moon clicks do not move it.
  tick();
  expectPosition(button, 250, 130);
  dragTo(button, 80, 365);
  const concealed = position(button);
  expect(Number(button.dataset.coverage)).toBeGreaterThan(0.9);
  expect(materials()[0].uniforms.uMoonVisibility.value).toBeLessThan(0.1);
  expect(button.style.visibility).toBe("visible");
  fireEvent.click(button, { detail: 1 }); tick();
  expect(position(button)).toEqual(concealed);
  fireEvent.click(button); tick();
  const expected = screenMoon(moonPosition(800, 600), 800, 600);
  expect(position(button).x).toBeGreaterThan(concealed.x);
  expect(position(button).x).toBeLessThan(expected.x);
  for (let i = 0; i < 14; i++) tick();
  expect(position(button).x).toBeCloseTo(expected.x);
  expect(position(button).y).toBeCloseTo(expected.y);
  expect(materials()[0].uniforms.uMoonVisibility.value).toBeCloseTo(1);
});

test("keyboard movement and Home return suspend in hidden tabs, and dragging interrupts return", () => {
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" }), initial = position(button);
  tick();
  fireEvent.keyDown(button, { key: "ArrowLeft", shiftKey: true }); tick();
  expect(position(button).x).toBeCloseTo(initial.x - 32);
  fireEvent.keyDown(button, { key: "Home" }); tick();
  const middle = position(button);
  expect(middle.x).toBeGreaterThan(initial.x - 32);
  expect(middle.x).toBeLessThan(initial.x);
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange")); tick(20000);
  expect(position(button)).toEqual(middle);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange")); tick(20000);
  expect(position(button)).toEqual(middle);
  tick();
  expect(position(button).x).toBeGreaterThan(middle.x);
  dragTo(button, 400, 150);
  for (let i = 0; i < 14; i++) tick();
  expectPosition(button, 400, 150);
});

test("passive coarse-screen parallax continues after pointer cancellation and settles on release", () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  const remove = jest.spyOn(window, "removeEventListener");
  const { unmount } = render(<Landscape />);
  tick();
  const scene = mockRenderer.compile.mock.calls[0][0] as THREE.Scene;
  const mountain = scene.children.find((child) => child.renderOrder === 2)!;
  touch("touchstart", [{ clientX: 400, clientY: 300 }]);
  touch("touchmove", [{ clientX: 0, clientY: 150 }]); tick();
  expect(mountain.position.x).toBeLessThan(0);
  expect(mountain.position.y).toBeGreaterThan(0);
  pointer(window, "pointercancel");
  touch("touchmove", [{ clientX: 800, clientY: 450 }]); tick();
  expect(mountain.position.x).toBeGreaterThan(0);
  const right = mountain.position.x;
  touch("touchend", []); tick();
  expect(mountain.position.x).toBeGreaterThan(0);
  expect(mountain.position.x).toBeLessThan(right);
  unmount();
  ["pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "touchcancel"].forEach((event) =>
    expect(remove).toHaveBeenCalledWith(event, expect.any(Function)));
});

test.each(["initialization failure", "context loss"])("%s preserves moon interaction and position through fallback resize", (failure) => {
  fakeResizeTimers();
  mockFailRenderer = failure === "initialization failure";
  const { container, getByRole, unmount } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" });
  tick(); dragTo(button, 250, 130);
  if (failure === "context loss") {
    fireEvent(mockRenderer.domElement, new Event("webglcontextlost", { cancelable: true }));
    expect(mockRenderer.domElement.style.display).toBe("none");
  }
  expect(container.querySelector(".landscape")).toHaveAttribute("data-renderer", "canvas2d");
  expectPosition(button, 250, 130);
  drawImage.mockClear();
  dragTo(button, 350, 160, "touch");
  expect(drawImage).toHaveBeenCalled();
  resize();
  expectPosition(button, 350, 160);
  expect(container.querySelectorAll("canvas")).toHaveLength(failure === "context loss" ? 2 : 1);
  fireEvent.keyDown(button, { key: "Home" });
  for (let i = 0; i < 14; i++) tick();
  const expected = screenMoon(moonPosition(800, 600), 800, 600);
  expect(position(button).x).toBeCloseTo(expected.x);
  expect(position(button).y).toBeCloseTo(expected.y);
  unmount();
});

test("new mounts restore the default moon without persisting moved coordinates", () => {
  const read = jest.spyOn(Storage.prototype, "getItem"), write = jest.spyOn(Storage.prototype, "setItem");
  const first = render(<Landscape />);
  const initial = position(first.getByRole("button", { name: "Move moon" }));
  dragTo(first.getByRole("button", { name: "Move moon" }), 250, 130);
  first.unmount();
  const second = render(<Landscape />);
  expect(position(second.getByRole("button", { name: "Move moon" }))).toEqual(initial);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
