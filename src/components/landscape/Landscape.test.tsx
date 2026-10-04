import { act, fireEvent, render } from "@testing-library/react";
import * as THREE from "three";
import Landscape from "./Landscape";
import { moonPosition } from "./composition";
import { screenMoon } from "./moon";
import * as clouds from "./clouds";
import { getCloudAtlas } from "./clouds";
import * as coverage from "./coverage";
import * as painting from "./painting";
import { cloudFragment, moonFragment } from "./shaders";

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
      initTexture: jest.fn(),
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
  tick(); tick(8);
  expect(mockRenderer.render).toHaveBeenCalledTimes(1);
  rerender(<Landscape />);
  tick(8);
  expect(mockRenderer.render).toHaveBeenCalledTimes(2);
  expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
  expect(materials().filter((m) => m.uniforms.uWindMap).map((m) => m.uniforms.uKind.value).sort()).toEqual([2, 3]);
  const textures = new Set<THREE.Texture>();
  materials().forEach((material) => Object.values(material.uniforms).forEach(({ value }) => {
    if (value instanceof THREE.Texture) textures.add(value);
  }));
  expect(textures.size).toBeGreaterThan(15);
  const data = Array.from(textures).filter((texture) => texture instanceof THREE.DataTexture);
  expect(data.filter((texture) => texture.format !== THREE.RedFormat)).toHaveLength(2);
  // One nearest-filtered occupancy grid per painting layer, plus clouds and mist.
  const cells = data.filter((texture) => texture.format === THREE.RedFormat);
  expect(cells).toHaveLength(materials().filter((m) => m.uniforms.uCoverage).length);
  cells.forEach((texture) => {
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.unpackAlignment).toBe(1);
  });
  // Paintings are never minified, so they skip mipmaps.
  Array.from(textures).filter((texture) => texture instanceof THREE.CanvasTexture).forEach((texture) => {
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
  });
  // Water and both shallows layers share one half-float edge field at the bridge's parallax.
  const edges = materials().find((m) => m.uniforms.uKind.value === 1)!.uniforms.uWaveBoundary.value as THREE.DataTexture;
  expect(edges.type).toBe(THREE.HalfFloatType);
  expect(edges.colorSpace).toBe(THREE.NoColorSpace);
  expect(edges.magFilter).toBe(THREE.LinearFilter);
  const shallows = materials().filter((m) => m.uniforms.uKind.value === 4);
  expect(shallows.map((m) => m.uniforms.uWaveBoundary.value)).toEqual(shallows.map(() => edges));
  expect(materials().find((m) => m.uniforms.uKind.value === 1)!.uniforms.uBoundaryParallax.value).toBe(1);
  expect(shallows.map((m) => m.uniforms.uBoundaryParallax.value).sort()).toEqual([0, 1]);
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

test.each([60, 120, 144])("targets 60 fps on a %i Hz display without changing animation speed", (refreshRate) => {
  render(<Landscape />);
  tick();
  mockRenderer.render.mockClear();
  for (let i = 0; i < refreshRate; i++) tick(1000 / refreshRate);
  expect(mockRenderer.render).toHaveBeenCalledTimes(60);
  expect(materials()[0].uniforms.uTime.value).toBeCloseTo(1, 2);
});

test("shared weather and lighting survive hidden tabs and resize without catching up", () => {
  jest.spyOn(clouds, "cloudTransmission").mockImplementation((_uv, _aspect, air) =>
    Math.exp(-2 * Math.hypot(air.x, air.y)));
  fakeResizeTimers();
  const { unmount } = render(<Landscape />);
  tick(); tick();
  const uniforms = materials()[0].uniforms;
  const snapshot = () => {
    const u = materials()[0].uniforms;
    return [u.uTime.value, u.uWaterEnergy.value, ...u.uAirOffset.value.toArray(),
      ...u.uWillow.value.toArray(), ...u.uReeds.value.toArray(), ...u.uWaveBasis.value.toArray(),
      u.uDirectIntensity.value, u.uAmbientGain.value, u.uIncidentIntensity.value,
      ...u.uSourceDirection.value.toArray(), ...u.uSourceCovariance.value.toArray()];
  };
  const shared = ["uAirOffset", "uWaveBasis", "uMoon", "uLightDirection", "uMoonVisibility",
    "uDirectIntensity", "uIncidentIntensity", "uAmbientGain", "uSourceDirection",
    "uSourceTangentX", "uSourceTangentY", "uSourceCovariance", "uCloudMap", "uCloudBasis", "uCloudPhase"];
  materials().forEach((material) => {
    shared.forEach((key) => expect(material.uniforms[key]).toBe(uniforms[key]));
  });
  const oldAtlas = uniforms.uCloudMap.value as THREE.DataTexture;
  const disposeAtlas = jest.spyOn(oldAtlas, "dispose");
  const stopped = snapshot(), renders = mockRenderer.render.mock.calls.length;
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  // Rebuild through another size and back: an unchanged size is never rebuilt.
  const box = (width: number) => (HTMLElement.prototype.getBoundingClientRect as jest.Mock).mockReturnValue({
    width, height: 600, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 600, toJSON: () => ({}),
  });
  tick(20000); box(820); resize(); box(800); resize(); tick();
  expect(snapshot()).toEqual(stopped);
  expect(mockRenderer.render).toHaveBeenCalledTimes(renders);
  materials().forEach((material) => {
    shared.forEach((key) => expect(material.uniforms[key]).toBe(uniforms[key]));
  });
  expect(disposeAtlas).toHaveBeenCalledTimes(1);
  const newAtlas = materials()[0].uniforms.uCloudMap.value as THREE.DataTexture;
  expect(newAtlas).not.toBe(oldAtlas);
  expect(newAtlas.image.data).toBe(oldAtlas.image.data);
  const disposeNewAtlas = jest.spyOn(newAtlas, "dispose");
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  tick(20000);
  expect(snapshot()).toEqual(stopped);
  tick();
  expect(snapshot()[0] - stopped[0]).toBeCloseTo(0.05);
  expect(snapshot().slice(2, 4)).not.toEqual(stopped.slice(2, 4));
  unmount();
  expect(disposeAtlas).toHaveBeenCalledTimes(1);
  expect(disposeNewAtlas).toHaveBeenCalledTimes(1);
});

test("advecting clouds dim every receiver while the moon stays stationary", () => {
  const transmission = jest.spyOn(clouds, "cloudTransmission").mockImplementation((_uv, _aspect, air) =>
    Math.exp(-8 * Math.hypot(air.x, air.y)));
  const { getByRole } = render(<Landscape />);
  const button = getByRole("button", { name: "Move moon" });
  tick();
  const start = position(button), uniforms = materials()[0].uniforms;
  const direct = uniforms.uDirectIntensity.value, ambient = uniforms.uAmbientGain.value;
  const incident = uniforms.uIncidentIntensity.value;
  const calls = transmission.mock.calls.length;
  tick();
  expect(position(button)).toEqual(start);
  expect(transmission.mock.calls.length).toBeGreaterThan(calls);
  expect(uniforms.uDirectIntensity.value).toBeLessThan(direct);
  expect(uniforms.uAmbientGain.value).toBeLessThan(ambient);
  expect(uniforms.uAmbientGain.value).toBeGreaterThanOrEqual(0.88);
  expect(uniforms.uIncidentIntensity.value).toBe(incident);
  materials().forEach(({ uniforms: receiver }) => {
    expect(receiver.uDirectIntensity).toBe(uniforms.uDirectIntensity);
    expect(receiver.uAmbientGain).toBe(uniforms.uAmbientGain);
    expect(receiver.uSourceDirection).toBe(uniforms.uSourceDirection);
  });
});

test("the single cloud layer covers the moon before the mountain silhouettes", () => {
  render(<Landscape />);
  const scene = mockRenderer.compile.mock.calls[0][0] as THREE.Scene;
  const byShader = (fragment: string) => scene.children.filter((child) =>
    ((child as THREE.Mesh).material as THREE.ShaderMaterial)?.fragmentShader === fragment);
  const clouds = byShader(cloudFragment), moons = byShader(moonFragment);
  expect(clouds).toHaveLength(1);
  expect(moons).toHaveLength(1);
  expect(moons[0].renderOrder).toBe(1);
  expect(clouds[0].renderOrder).toBe(1.25);
  expect(scene.children.some((child) => child.renderOrder === 2)).toBe(true);
  const texture = ((clouds[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uCloudMap.value;
  expect(texture).toBeInstanceOf(THREE.DataTexture);
  expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(texture.magFilter).toBe(THREE.LinearFilter);
  expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(texture.generateMipmaps).toBe(true);
  const { uniforms } = (clouds[0] as THREE.Mesh).material as THREE.ShaderMaterial;
  expect(uniforms.uCloudPhase.value.toArray()).toEqual([...getCloudAtlas().phase]);
  expect(uniforms.uCloudBasis.value.toArray()).toEqual([...getCloudAtlas().basis]);
  expect(texture.wrapS).toBe(THREE.RepeatWrapping);
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
  // This interaction test isolates mountain coverage from moving cloud transmission.
  jest.spyOn(clouds, "cloudTransmission").mockReturnValue(1);
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

test("context-loss fallback receives the same shared lighting and updates it after a drag", () => {
  jest.spyOn(clouds, "cloudTransmission").mockReturnValue(0.4);
  const fallback = jest.spyOn(painting, "drawFallback");
  const { getByRole } = render(<Landscape />);
  tick(); tick();
  const button = getByRole("button", { name: "Move moon" });
  const uniforms = materials()[0].uniforms;
  const before = {
    direct: uniforms.uDirectIntensity.value, ambient: uniforms.uAmbientGain.value,
    incident: uniforms.uIncidentIntensity.value,
    source: uniforms.uSourceDirection.value.toArray(),
    covariance: uniforms.uSourceCovariance.value.toArray(),
    air: uniforms.uAirOffset.value.toArray(),
  };
  fireEvent(mockRenderer.domElement, new Event("webglcontextlost", { cancelable: true }));
  const options = () => fallback.mock.calls[fallback.mock.calls.length - 1][2]!;
  expect(options().illumination.directIntensity).toBeCloseTo(before.direct);
  expect(options().illumination.ambientGain).toBeCloseTo(before.ambient);
  expect(options().illumination.incidentIntensity).toBeCloseTo(before.incident);
  expect(options().illumination.sourceDirection).toEqual(before.source);
  expect(options().illumination.covariance).toEqual(before.covariance);
  expect(options().air).toEqual({ x: before.air[0], y: before.air[1] });
  expect(options().mountainMask).toBeInstanceOf(HTMLCanvasElement);
  dragTo(button, 80, 365);
  expect(options().illumination.directIntensity).toBeLessThan(before.direct * 0.1);
  expect(options().illumination.ambientGain).toBeGreaterThanOrEqual(0.88);
  expect(options().illumination.sourceDirection).not.toEqual(before.source);
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

test("an unchanged size never rebuilds the scene", () => {
  fakeResizeTimers();
  const paint = jest.spyOn(painting, "paintLandscape");
  render(<Landscape />);
  const scene = mockRenderer.compile.mock.calls[0][0] as THREE.Scene;
  const children = [...scene.children];
  // ResizeObserver reports the initial size once it starts observing.
  resize();
  expect(paint).toHaveBeenCalledTimes(1);
  expect(scene.children).toEqual(children);
  expect(mockRenderer.setSize).toHaveBeenCalledTimes(1);
});

test("paintings upload once, release their canvases, and repaint for the Canvas fallback", () => {
  const paint = jest.spyOn(painting, "paintLandscape");
  render(<Landscape />);
  tick();
  // WebGL computes ripples live and skips the fallback-only static river.
  expect(paint).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), false);
  const [paintings] = paint.mock.results.map((result) => result.value as painting.Painting[]);
  const river = paintings.find((p) => p.kind === "water")!;
  expect(river.fallback).toBeUndefined();
  const uploaded = mockRenderer.initTexture.mock.calls.map(([map]: [THREE.Texture]) => map);
  materials().filter((m) => m.uniforms.uMap).forEach((m) => expect(uploaded).toContain(m.uniforms.uMap.value));
  paintings.forEach((p) => {
    expect(p.canvas.width).toBe(0);
    if (p.normalMap) expect(p.normalMap.width).toBe(0);
  });
  // The river's light-occlusion mask is repainted whenever the moon moves.
  expect(river.shadowMap!.width).toBeGreaterThan(0);
  fireEvent(mockRenderer.domElement, new Event("webglcontextlost", { cancelable: true }));
  expect(paint).toHaveBeenCalledTimes(2);
  expect(paint).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), true);
  const repainted = paint.mock.results[1].value as painting.Painting[];
  expect(repainted.find((p) => p.kind === "water")!.fallback).toBeInstanceOf(HTMLCanvasElement);
  expect(repainted.every((p) => p.canvas.width > 0)).toBe(true);
});

test("each layer rasterizes only its visible cells and samples a cropped texture", () => {
  const measure = jest.spyOn(coverage, "measureCells").mockImplementation((width, height, requests) => {
    const columns = Math.ceil(width / coverage.COVERAGE_CELL), rows = Math.ceil(height / coverage.COVERAGE_CELL);
    // Every layer occupies only the lower-left quarter; occluders cover it fully.
    const quarter = coverage.rectCells({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, columns, rows);
    return { columns, rows, layers: requests.map(({ occluder }) => ({ occupied: quarter, opaque: occluder ? quarter : null })) };
  });
  render(<Landscape />);
  expect(measure).toHaveBeenCalledTimes(1);
  const scene = mockRenderer.compile.mock.calls[0][0] as THREE.Scene;
  const meshes = scene.children.filter((child) => (child as THREE.Mesh).material instanceof THREE.ShaderMaterial) as THREE.Mesh[];
  const uniforms = (mesh: THREE.Mesh) => (mesh.material as THREE.ShaderMaterial).uniforms;
  const uvs = (mesh: THREE.Mesh) => Array.from(mesh.geometry.getAttribute("uv").array as Float32Array);
  const willow = meshes.find((mesh) => uniforms(mesh).uKind.value === 2)!;
  // The topmost layer is never hidden: its quad is its dilated content bounds.
  expect(willow.visible).toBe(true);
  const [x0, y1, x1] = uvs(willow);
  expect(x0).toBe(0);
  expect(x1).toBeGreaterThan(0.5);
  expect(x1).toBeLessThan(0.6);
  expect(y1).toBeGreaterThan(0.5);
  const crop = uniforms(willow).uCrop.value as THREE.Vector4;
  expect(crop.z).toBeCloseTo(x1, 2);
  // Mountains beneath later opaque layers shade only the one-cell parallax margin.
  const cell = (mesh: THREE.Mesh, u: number, v: number) => {
    const { data, width, height } = (uniforms(mesh).uCoverage.value as THREE.DataTexture).image;
    return data[Math.floor(v * height) * width + Math.floor(u * width)];
  };
  expect(cell(willow, 0.25, 0.25)).toBe(255);
  expect(cell(willow, 0.75, 0.75)).toBe(0);
  meshes.filter((mesh) => [2, 3, 4].includes(mesh.renderOrder)).forEach((mesh) => {
    expect(cell(mesh, 0.25, 0.25)).toBe(0);
    expect(cell(mesh, 0.5, 0.25)).toBe(255);
  });
  // The moon quad hugs its sprite rather than covering the viewport.
  const moon = meshes.find((mesh) => mesh.renderOrder === 1)!;
  const [mx0, my1, mx1, , , my0] = uvs(moon);
  const { x, y, z } = uniforms(moon).uMoonScreen.value;
  expect((mx0 + mx1) / 2).toBeCloseTo(x);
  expect((my0 + my1) / 2).toBeCloseTo(y);
  expect(my1 - my0).toBeCloseTo(6 * z);
});
