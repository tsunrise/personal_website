import { act, fireEvent, render } from "@testing-library/react";
import * as THREE from "three";
import Landscape from "./Landscape";
let mockFailRenderer = false;
let mockRenderer: any;
jest.mock("three", () => {
  const actual = jest.requireActual("three");
  return { ...actual, WebGLRenderer: jest.fn() };
});
let frame: FrameRequestCallback;
let mockObserver: ResizeObserverCallback;
const disconnect = jest.fn();
const drawImage = jest.fn();
beforeEach(() => {
  mockFailRenderer = false;
  jest.clearAllMocks();
  (THREE.WebGLRenderer as unknown as jest.Mock).mockImplementation(() => {
    if (mockFailRenderer) throw new Error("No WebGL");
    mockRenderer = {
      domElement: document.createElement("canvas"),
      setSize: jest.fn(),
      setPixelRatio: jest.fn(),
      render: jest.fn(),
      compile: jest.fn(),
      dispose: jest.fn(),
    };
    return mockRenderer;
  });
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() =>
      new Proxy(
        { drawImage },
        {
          get: (target, key) => {
            if (key === "drawImage") return drawImage;
            if (
              key === "createLinearGradient" ||
              key === "createRadialGradient"
            )
              return () => ({ addColorStop: () => {} });
            return () => {};
          },
        },
      )) as any,
  );
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    toJSON: () => ({}),
  });
  window.matchMedia = jest.fn().mockReturnValue({ matches: true });
  window.requestAnimationFrame = jest.fn((cb) => {
    frame = cb;
    return 1;
  });
  window.cancelAnimationFrame = jest.fn();
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    mockObserver = callback;
    return { observe: jest.fn(), disconnect };
  });
});
afterEach(() => jest.restoreAllMocks());
test("motion changes do not rebuild the scene; paused frames stay still and cleanup releases resources", () => {
  const { rerender, unmount } = render(<Landscape motion={false} />);
  act(() => frame(100));
  act(() => frame(116));
  expect(mockRenderer.render).toHaveBeenCalledTimes(1);
  rerender(<Landscape motion />);
  act(() => frame(140));
  expect(mockRenderer.render).toHaveBeenCalledTimes(2);
  expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
  const scene = mockRenderer.render.mock.calls[0][0] as THREE.Scene;
  const foliage = scene.children
    .map((child) => (child as THREE.Mesh).material as THREE.ShaderMaterial)
    .filter((material) => material.uniforms?.uWindMap);
  expect(
    foliage.map((material) => material.uniforms.uKind.value).sort(),
  ).toEqual([2, 3]);
  const masks = foliage.map((material) =>
    jest.spyOn(material.uniforms.uWindMap.value, "dispose"),
  );
  rerender(<Landscape motion={false} />);
  act(() => frame(180));
  const stopped = foliage.map((material) => material.uniforms.uTime.value);
  act(() => frame(300));
  expect(foliage.map((material) => material.uniforms.uTime.value)).toEqual(
    stopped,
  );
  unmount();
  masks.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  expect(disconnect).toHaveBeenCalled();
  expect(mockRenderer.dispose).toHaveBeenCalledTimes(1);
  expect(window.cancelAnimationFrame).toHaveBeenCalled();
});
test("failed WebGL initializes a composed Canvas 2D fallback", () => {
  mockFailRenderer = true;
  const { container } = render(<Landscape motion />);
  expect(container.querySelector(".landscape")).toHaveAttribute(
    "data-renderer",
    "canvas2d",
  );
  expect(container.querySelector("canvas")).toBeInTheDocument();
  expect(drawImage).toHaveBeenCalled();
});
test("all layers share weather that survives pause, hidden tabs, and resize", () => {
  const requestFrame = window.requestAnimationFrame;
  const cancelFrame = window.cancelAnimationFrame;
  jest.useFakeTimers();
  window.requestAnimationFrame = requestFrame;
  window.cancelAnimationFrame = cancelFrame;
  const { rerender, unmount } = render(<Landscape motion />);
  const materials = () => {
    const scene = mockRenderer.render.mock.calls[0][0] as THREE.Scene;
    return scene.children
      .map((child) => (child as THREE.Mesh).material as THREE.ShaderMaterial)
      .filter((material) => material.uniforms?.uAirOffset);
  };
  const snapshot = () => {
    const uniforms = materials()[0].uniforms;
    return [
      uniforms.uTime.value,
      uniforms.uWaterEnergy.value,
      ...uniforms.uAirOffset.value.toArray(),
      ...uniforms.uWillow.value.toArray(),
      ...uniforms.uReeds.value.toArray(),
      ...uniforms.uCurrentOffset.value.toArray(),
      ...uniforms.uWaveBasis.value.toArray(),
    ];
  };
  act(() => {
    frame(100);
    frame(150);
  });
  const shared = materials()[0].uniforms.uAirOffset;
  const waveBasis = materials()[0].uniforms.uWaveBasis;
  materials().forEach((material) => {
    expect(material.uniforms.uAirOffset).toBe(shared);
    expect(material.uniforms.uWaveBasis).toBe(waveBasis);
    expect(material.uniforms.uTime.value).toBeGreaterThan(0);
  });
  const waterKinds = materials()
    .map((material) => material.uniforms.uKind.value)
    .filter((kind) => kind === 1 || kind === 4);
  expect(waterKinds.sort()).toEqual([1, 4, 4]);
  rerender(<Landscape motion={false} />);
  act(() => frame(200));
  const stopped = snapshot();
  act(() => {
    frame(20000);
    mockObserver([], {} as ResizeObserver);
    jest.advanceTimersByTime(200);
    frame(20100);
  });
  expect(snapshot()).toEqual(stopped);
  expect(materials()[0].uniforms.uAirOffset).toBe(shared);
  expect(materials()[0].uniforms.uWaveBasis).toBe(waveBasis);
  rerender(<Landscape motion />);
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => frame(30000));
  expect(snapshot()).toEqual(stopped);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  act(() => frame(40000));
  expect(snapshot()).toEqual(stopped);
  act(() => frame(40050));
  expect(snapshot()[0] - stopped[0]).toBeCloseTo(0.05);
  expect(
    Math.hypot(snapshot()[2] - stopped[2], snapshot()[3] - stopped[3]),
  ).toBeGreaterThan(0);
  unmount();
  jest.useRealTimers();
});
test("touch parallax follows a finger on coarse screens without blocking scrolling, then settles on release", () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  const remove = jest.spyOn(window, "removeEventListener");
  const { rerender, unmount } = render(<Landscape motion />);
  act(() => frame(100));
  const scene = mockRenderer.render.mock.calls[0][0] as THREE.Scene;
  const moon = scene.children.find((child) => child.renderOrder === 1)!;
  const move = (type: string, touches: { clientX: number; clientY: number }[]) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
  };
  move("touchstart", [{ clientX: 400, clientY: 300 }]);
  move("touchmove", [{ clientX: 0, clientY: 150 }]);
  act(() => frame(150));
  expect(moon.position.x).toBeLessThan(0);
  expect(moon.position.y).toBeGreaterThan(0);
  const left = moon.position.x;
  // Native scrolling may cancel pointer events; touchmove must still work.
  fireEvent(window, new Event("pointercancel"));
  move("touchmove", [{ clientX: 800, clientY: 450 }]);
  act(() => frame(200));
  expect(moon.position.x).toBeGreaterThan(left);
  expect(moon.position.x).toBeGreaterThan(0);
  const right = moon.position.x;
  move("touchend", []);
  act(() => frame(250));
  expect(moon.position.x).toBeGreaterThan(0);
  expect(moon.position.x).toBeLessThan(right);
  rerender(<Landscape motion={false} />);
  move("touchmove", [{ clientX: 800, clientY: 0 }]);
  act(() => frame(300));
  expect(moon.position.x).toBe(0);
  expect(moon.position.y).toBeCloseTo(0);
  unmount();
  ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((event) =>
    expect(remove).toHaveBeenCalledWith(event, expect.any(Function)),
  );
});
test("context loss switches to a static fallback and survives resize", () => {
  jest.useFakeTimers();
  const { container, unmount } = render(<Landscape motion />);
  act(() =>
    mockRenderer.domElement.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    ),
  );
  expect(container.querySelector(".landscape")).toHaveAttribute(
    "data-renderer",
    "canvas2d",
  );
  expect(mockRenderer.domElement.style.display).toBe("none");
  act(() => {
    mockObserver([], {} as ResizeObserver);
    jest.advanceTimersByTime(200);
  });
  expect(container.querySelectorAll("canvas")).toHaveLength(2);
  unmount();
  jest.useRealTimers();
});
