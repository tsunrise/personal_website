import { act, render } from "@testing-library/react";
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
