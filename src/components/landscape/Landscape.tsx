import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { drawFallback, paintLandscape, Painting } from "./painting";
import { createGeese, createFlightSchedule } from "./geese";
import { createWind } from "./wind";
import { moonPosition } from "./composition";
import { vertex, skyFragment, paintFragment, mistFragment } from "./shaders";

function Landscape({ motion }: { motion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const enabled = useRef(motion);
  useEffect(() => {
    enabled.current = motion;
  }, [motion]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0,
      disposed = false,
      fallback = false;
    let width = 0,
      height = 0,
      elapsed = 0,
      last = 0,
      renderedStill = false;
    let paintings: Painting[] = [];
    let fallbackCanvas: HTMLCanvasElement | undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.z = 10;
    const geometry = new THREE.PlaneGeometry(2, 2);
    const materials: THREE.ShaderMaterial[] = [];
    const textures: THREE.Texture[] = [];
    let geese: ReturnType<typeof createGeese> | undefined;
    const flightSchedule = createFlightSchedule();
    const wind = createWind();
    const shadowOffset = { value: new THREE.Vector2() };
    // Share uniform objects across layers and resize; never reset the weather.
    const weather = {
      uWind: { value: new THREE.Vector2() },
      uAirOffset: { value: new THREE.Vector2() },
      uWillow: { value: new THREE.Vector2() },
      uReeds: { value: new THREE.Vector2() },
      uWaterWind: { value: new THREE.Vector2() },
      uWaveBasis: {
        value: new THREE.Vector2(
          wind.state.waveBasis.x,
          wind.state.waveBasis.z,
        ),
      },
      uWaterEnergy: { value: wind.state.waterEnergy },
      uCurrentOffset: { value: new THREE.Vector2() },
    };
    function updateWeather() {
      const state = wind.state;
      weather.uWind.value.set(state.velocity.x, state.velocity.z);
      weather.uAirOffset.value.set(state.displacement.x, state.displacement.z);
      weather.uWillow.value.set(state.willow.x, state.willow.z);
      weather.uReeds.value.set(state.reeds.x, state.reeds.z);
      weather.uWaterWind.value.set(state.water.x, state.water.z);
      weather.uWaterEnergy.value = state.waterEnergy;
      weather.uCurrentOffset.value.set(
        state.currentDisplacement.x,
        state.currentDisplacement.z,
      );
    }
    updateWeather();
    const layers: { mesh: THREE.Mesh; depth: number }[] = [];
    const finePointer = window.matchMedia("(pointer: fine)");
    const point = { x: 0, y: 0 },
      target = { x: 0, y: 0 };
    function clearScene() {
      geese?.dispose();
      geese = undefined;
      scene.clear();
      materials.splice(0).forEach((m) => m.dispose());
      textures.splice(0).forEach((t) => t.dispose());
      layers.length = 0;
    }
    function plane(
      fragmentShader: string,
      order: number,
      depth: number,
      map?: HTMLCanvasElement,
      kind = 0,
      windMap?: HTMLCanvasElement,
      shadowMap?: HTMLCanvasElement,
    ) {
      const moon = moonPosition(width, height);
      const uniforms: { [key: string]: THREE.IUniform } = {
        ...weather,
        uMoon: { value: new THREE.Vector3(moon.x, moon.y, moon.radius) },
        uTime: { value: elapsed },
        uAspect: { value: width / height },
        uKind: { value: kind },
        uSize: { value: new THREE.Vector2(width, height) },
        uShadowOffset: shadowOffset,
      };
      if (map) {
        const texture = new THREE.CanvasTexture(map);
        texture.colorSpace = THREE.NoColorSpace;
        textures.push(texture);
        uniforms.uMap = { value: texture };
      }
      if (windMap) {
        const texture = new THREE.CanvasTexture(windMap);
        texture.colorSpace = THREE.NoColorSpace;
        textures.push(texture);
        uniforms.uWindMap = { value: texture };
      }
      if (shadowMap) {
        const texture = new THREE.CanvasTexture(shadowMap);
        texture.colorSpace = THREE.NoColorSpace;
        textures.push(texture);
        uniforms.uShadowMap = { value: texture };
      }
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader,
        uniforms,
        transparent: order !== 0,
        depthTest: false,
        depthWrite: false,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = order;
      mesh.scale.set(1.055, 1.055, 1);
      scene.add(mesh);
      layers.push({ mesh, depth });
    }
    function showFallback() {
      if (disposed) return;
      fallback = true;
      cancelAnimationFrame(frame);
      if (!fallbackCanvas) {
        fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.setAttribute("aria-hidden", "true");
        container!.appendChild(fallbackCanvas);
      }
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      drawFallback(fallbackCanvas, paintings);
      if (renderer) renderer.domElement.style.display = "none";
      container!.dataset.renderer = "canvas2d";
    }
    function resize() {
      if (disposed) return;
      const box = container!.getBoundingClientRect();
      width = Math.max(1, Math.round(box.width));
      height = Math.max(1, Math.round(box.height));
      // Textures use CSS-pixel proportions, capped independently of device pixel ratio.
      const scale = Math.min(1.5, 1600 / width, 1400 / height);
      paintings = paintLandscape(
        Math.round(width * scale),
        Math.round(height * scale),
      );
      if (fallback) {
        showFallback();
        return;
      }
      clearScene();
      renderer!.setSize(width, height, false);
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      plane(skyFragment, 0, 0);
      geese = createGeese(scene, flightSchedule);
      paintings.forEach((p, i) =>
        plane(
          paintFragment,
          i + 1,
          p.depth,
          p.canvas,
          p.kind === "water"
            ? 1
            : p.kind === "willow"
              ? 2
              : p.kind === "reeds"
                ? 3
                : p.kind === "shallows"
                  ? 4
                  : 0,
          p.windMap,
          p.shadowMap,
        ),
      );
      plane(mistFragment, 5.5, 3);
      renderedStill = false;
    }
    function render(now: number) {
      if (disposed || fallback) return;
      frame = requestAnimationFrame(render);
      if (document.hidden) {
        last = now;
        return;
      }
      const moving = enabled.current;
      if (!moving && renderedStill) {
        last = now;
        return;
      }
      if (moving && !renderedStill && last && now - last < 1000 / 30) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (moving) {
        wind.advance(dt);
        elapsed = wind.state.time;
        updateWeather();
      }
      const lerp = 1 - Math.exp(-dt * 3.5);
      point.x += ((moving ? target.x : 0) - point.x) * lerp;
      point.y += ((moving ? target.y : 0) - point.y) * lerp;
      if (!moving) {
        point.x = 0;
        point.y = 0;
      }
      // The water is depth 3, while the bridge is depth 4. Keep its lighting
      // mask attached to the bridge through parallax and the 1.055 overscan.
      shadowOffset.value.set(
        point.x / (width * 1.055),
        -point.y / (height * 1.055),
      );
      layers.forEach(({ mesh, depth }) => {
        mesh.position.x = (point.x * depth * 2) / width;
        mesh.position.y = (-point.y * depth * 2) / height;
      });
      materials.forEach((m) => {
        m.uniforms.uTime.value = elapsed;
      });
      geese?.update(elapsed, width, height);
      renderer!.render(scene, camera);
      renderedStill = !moving;
    }
    const follow = (x: number, y: number) => {
      target.x = Math.max(-1, Math.min(1, (x / width - 0.5) * 2));
      target.y = Math.max(-1, Math.min(1, (y / height - 0.5) * 2));
      renderedStill = false;
    };
    const pointer = (e: PointerEvent) => {
      if (!finePointer.matches || e.pointerType === "touch") return;
      follow(e.clientX, e.clientY);
    };
    const leave = () => {
      target.x = target.y = 0;
    };
    // Passive Touch Events keep following a finger after Safari hands a pan to
    // native scrolling (which cancels Pointer Events). Pinch gestures stay native.
    const touch = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        leave();
        return;
      }
      follow(e.touches[0].clientX, e.touches[0].clientY);
    };
    const visibility = () => {
      last = 0;
      renderedStill = false;
    };
    const lost = (e: Event) => {
      e.preventDefault();
      showFallback();
    };
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        powerPreference: "low-power",
      });
      renderer.domElement.setAttribute("aria-hidden", "true");
      container.appendChild(renderer.domElement);
      container.dataset.renderer = "webgl";
      renderer.domElement.addEventListener("webglcontextlost", lost);
      resize();
      renderer.compile(scene, camera);
      frame = requestAnimationFrame(render);
    } catch {
      if (!paintings.length) {
        width = Math.max(1, container.clientWidth);
        height = Math.max(1, container.clientHeight);
        paintings = paintLandscape(width, height);
      }
      showFallback();
    }
    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 160);
    });
    observer.observe(container);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("touchstart", touch, { passive: true });
    window.addEventListener("touchmove", touch, { passive: true });
    window.addEventListener("touchend", leave, { passive: true });
    window.addEventListener("touchcancel", leave, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("touchstart", touch);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("touchend", leave);
      window.removeEventListener("touchcancel", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      renderer?.domElement.removeEventListener("webglcontextlost", lost);
      clearScene();
      geometry.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      fallbackCanvas?.remove();
    };
  }, []);
  return <div className="landscape" ref={host} aria-hidden="true" />;
}
export default memo(Landscape);
