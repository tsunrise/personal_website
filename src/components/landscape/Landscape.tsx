import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { drawFallback, paintLandscape, Painting } from "./painting";
import { paintBridgeWaterShadow } from "./bridge";
import { createGeese, createFlightSchedule } from "./geese";
import { createWind } from "./wind";
import { moonPosition } from "./composition";
import {
  canResetMoon, clampMoon, interpolateMoon, Moon, moonLight, MOON_DEPTH,
  mountainCoverage, OVERSCAN, paintMountainMask, Point, RESET_SECONDS,
  Ridge, screenMoon, screenToScene,
} from "./moon";
import { vertex, skyFragment, paintFragment, moonFragment, mistFragment } from "./shaders";

function Landscape() {
  const host = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const container = host.current;
    const button = control.current;
    if (!container || !button) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0, disposed = false, fallback = false;
    let width = 1, height = 1, elapsed = 0, last = 0, dirty = true;
    let paintings: Painting[] = [], ridges: Ridge[] = [];
    let moon = moonPosition(width, height), userPlaced = false, coverage = 0;
    let reset: { from: Moon; elapsed: number } | undefined;
    let drag: { id: number; start: Point; offset: Point; moved: boolean } | undefined;
    let suppressClick = false;
    let fallbackCanvas: HTMLCanvasElement | undefined;
    const mountainMask = document.createElement("canvas");
    let maskTexture: THREE.CanvasTexture | undefined;
    let shadowTexture: THREE.CanvasTexture | undefined;
    let previousShadow = "", previousMask = "", previousMoon = "";
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.z = 10;
    const geometry = new THREE.PlaneGeometry(2, 2);
    const materials: THREE.ShaderMaterial[] = [];
    const textures: THREE.Texture[] = [];
    const layers: { mesh: THREE.Mesh; depth: number; moon: boolean }[] = [];
    let geese: ReturnType<typeof createGeese> | undefined;
    const flightSchedule = createFlightSchedule();
    const wind = createWind();
    const shadowOffset = { value: new THREE.Vector2() };
    const light = {
      uMoon: { value: new THREE.Vector3() },
      uMoonScreen: { value: new THREE.Vector3() },
      uLightDirection: { value: new THREE.Vector3() },
      uDefaultLightDirection: { value: new THREE.Vector3() },
      uMoonVisibility: { value: 1 },
    };
    // Shared objects survive scene rebuilds, keeping weather and lighting coherent.
    const weather = {
      uWind: { value: new THREE.Vector2() },
      uAirOffset: { value: new THREE.Vector2() },
      uWillow: { value: new THREE.Vector2() },
      uReeds: { value: new THREE.Vector2() },
      uWaterWind: { value: new THREE.Vector2() },
      uWaveBasis: { value: new THREE.Vector2(wind.state.waveBasis.x, wind.state.waveBasis.z) },
      uWaterEnergy: { value: wind.state.waterEnergy },
      uCurrentOffset: { value: new THREE.Vector2() },
    };
    const finePointer = window.matchMedia("(pointer: fine)");
    const point = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    function updateWeather() {
      const state = wind.state;
      weather.uWind.value.set(state.velocity.x, state.velocity.z);
      weather.uAirOffset.value.set(state.displacement.x, state.displacement.z);
      weather.uWillow.value.set(state.willow.x, state.willow.z);
      weather.uReeds.value.set(state.reeds.x, state.reeds.z);
      weather.uWaterWind.value.set(state.water.x, state.water.z);
      weather.uWaterEnergy.value = state.waterEnergy;
      weather.uCurrentOffset.value.set(state.currentDisplacement.x, state.currentDisplacement.z);
    }
    updateWeather();
    function clearScene() {
      geese?.dispose();
      geese = undefined;
      scene.clear();
      materials.splice(0).forEach((m) => m.dispose());
      textures.splice(0).forEach((t) => t.dispose());
      layers.length = 0;
      maskTexture = shadowTexture = undefined;
    }
    function texture(canvas: HTMLCanvasElement) {
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.NoColorSpace;
      textures.push(map);
      return map;
    }
    function plane(fragmentShader: string, order: number, depth: number, painting?: Painting) {
      const isMoon = painting?.kind === "moon";
      const kind = painting?.kind === "water" ? 1 : painting?.kind === "willow" ? 2
        : painting?.kind === "reeds" ? 3 : painting?.kind === "shallows" ? 4 : 0;
      const uniforms: { [key: string]: THREE.IUniform } = {
        ...weather, ...light,
        uTime: { value: elapsed }, uAspect: { value: width / height },
        uKind: { value: kind }, uSize: { value: new THREE.Vector2(width, height) },
        uShadowOffset: shadowOffset,
        uMountainMask: { value: maskTexture },
        uLightStrength: { value: painting?.lightStrength ?? 0 },
        uTwoSided: { value: painting?.twoSided ? 1 : 0 },
      };
      if (painting) {
        uniforms.uMap = { value: texture(painting.canvas) };
        uniforms.uNormalMap = { value: painting.normalMap ? texture(painting.normalMap) : uniforms.uMap.value };
        if (painting.windMap) uniforms.uWindMap = { value: texture(painting.windMap) };
        if (painting.shadowMap) {
          shadowTexture = texture(painting.shadowMap);
          uniforms.uShadowMap = { value: shadowTexture };
        }
      }
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex, fragmentShader, uniforms, transparent: order !== 0,
        depthTest: false, depthWrite: false,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = order;
      mesh.scale.setScalar(isMoon ? 1 : OVERSCAN);
      scene.add(mesh);
      layers.push({ mesh, depth, moon: !!isMoon });
    }
    function updateMoon(force = false) {
      moon = clampMoon(moon, width, height, point);
      const moonKey = `${moon.x},${moon.y},${moon.radius},${point.x},${point.y},${width},${height}`;
      if (!force && moonKey === previousMoon) return;
      previousMoon = moonKey;
      const visible = screenMoon(moon, width, height, point);
      const currentLight = moonLight(moon, width, height, point);
      const reference = moonLight(moonPosition(width, height), width, height, point);
      coverage = mountainCoverage(moon, ridges, width, height, point);
      light.uMoon.value.set(currentLight.moon.x, currentLight.moon.y, moon.radius);
      light.uMoonScreen.value.set(visible.x / width, 1 - visible.y / height, visible.radius / height);
      light.uLightDirection.value.fromArray(currentLight.direction);
      light.uDefaultLightDirection.value.fromArray(reference.direction);
      light.uMoonVisibility.value = 1 - coverage;
      button!.style.left = `${visible.x}px`;
      button!.style.top = `${visible.y}px`;
      button!.style.width = button!.style.height = `${visible.radius * 2}px`;
      button!.style.transform = "translate(-50%, -50%)";
      button!.style.visibility = "visible";
      button!.dataset.coverage = coverage.toFixed(5);
      button!.setAttribute("aria-label", canResetMoon(coverage)
        ? "Move moon; click to return it to its default position" : "Move moon");
      const maskKey = `${point.x},${point.y}`;
      if (force || maskKey !== previousMask) {
        const ctx = mountainMask.getContext("2d");
        if (ctx) paintMountainMask(ctx, ridges, width, height, point);
        if (maskTexture) maskTexture.needsUpdate = true;
        previousMask = maskKey;
      }
      const shadowKey = currentLight.direction.map((v) => v.toFixed(5)).join(",");
      if (force || shadowKey !== previousShadow) {
        const shadow = paintings.find((p) => p.kind === "water")?.shadowMap;
        const ctx = shadow?.getContext("2d");
        if (ctx && shadow) paintBridgeWaterShadow(ctx, shadow.width, shadow.height, currentLight.direction);
        if (shadowTexture) shadowTexture.needsUpdate = true;
        previousShadow = shadowKey;
      }
    }
    function composeFallback() {
      if (!fallbackCanvas) return;
      const visible = screenMoon(moon, width, height, point);
      drawFallback(fallbackCanvas, paintings, {
        moon: { x: visible.x / width, y: 1 - visible.y / height, radius: visible.radius / height },
        direction: light.uLightDirection.value.toArray(),
        referenceDirection: light.uDefaultLightDirection.value.toArray(),
        visibility: 1 - coverage, mountainMask, parallax: point,
      });
    }
    function showFallback() {
      if (disposed) return;
      fallback = true;
      clearScene();
      if (!fallbackCanvas) {
        fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.setAttribute("aria-hidden", "true");
        container!.appendChild(fallbackCanvas);
      }
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      updateMoon(true);
      composeFallback();
      if (renderer) renderer.domElement.style.display = "none";
      container!.dataset.renderer = "canvas2d";
      dirty = false;
    }
    function releaseDrag(cancelled = false) {
      if (!drag) return;
      const active = drag;
      drag = undefined;
      suppressClick = active.moved || cancelled;
      button!.dataset.dragging = "false";
      if (button!.hasPointerCapture?.(active.id)) button!.releasePointerCapture(active.id);
      target.x = target.y = 0;
    }
    function resize() {
      if (disposed) return;
      releaseDrag(true);
      const box = container!.getBoundingClientRect();
      width = Math.max(1, Math.round(box.width));
      height = Math.max(1, Math.round(box.height));
      const initial = moonPosition(width, height);
      moon = clampMoon(userPlaced ? { ...moon, radius: initial.radius } : initial, width, height, point);
      if (reset) reset = { from: moon, elapsed: 0 };
      const scale = Math.min(1.5, 1600 / width, 1400 / height);
      paintings = paintLandscape(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      ridges = paintings.filter((p) => p.ridge).map((p) => ({ points: p.ridge!, depth: p.depth }));
      mountainMask.width = Math.max(1, Math.round(width * Math.min(scale, 1)));
      mountainMask.height = Math.max(1, Math.round(height * Math.min(scale, 1)));
      dirty = true;
      if (fallback) { showFallback(); return; }
      clearScene();
      renderer!.setSize(width, height, false);
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      maskTexture = texture(mountainMask);
      plane(skyFragment, 0, 0);
      geese = createGeese(scene, flightSchedule);
      paintings.forEach((p, i) => plane(p.kind === "moon" ? moonFragment : paintFragment, i + 1, p.depth, p));
      plane(mistFragment, 5.5, 3);
      updateMoon(true);
    }
    function render(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (document.hidden) { last = 0; return; }
      if (last && now - last < 1000 / 30) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (reset) {
        reset.elapsed += dt;
        moon = interpolateMoon(reset.from, moonPosition(width, height), reset.elapsed);
        if (reset.elapsed >= RESET_SECONDS) { reset = undefined; userPlaced = false; }
        dirty = true;
      }
      if (fallback) {
        if (dirty) { updateMoon(); composeFallback(); dirty = false; }
        return;
      }
      wind.advance(dt);
      elapsed = wind.state.time;
      updateWeather();
      if (!drag) {
        const lerp = 1 - Math.exp(-dt * 3.5);
        point.x += (target.x - point.x) * lerp;
        point.y += (target.y - point.y) * lerp;
        if (Math.abs(target.x - point.x) < 0.0001) point.x = target.x;
        if (Math.abs(target.y - point.y) < 0.0001) point.y = target.y;
      }
      shadowOffset.value.set(point.x / (width * OVERSCAN), -point.y / (height * OVERSCAN));
      layers.forEach(({ mesh, depth, moon: isMoon }) => {
        if (isMoon) return;
        mesh.position.x = point.x * depth * 2 / width;
        mesh.position.y = -point.y * depth * 2 / height;
      });
      updateMoon();
      materials.forEach((m) => { m.uniforms.uTime.value = elapsed; });
      geese?.update(elapsed, width, height);
      renderer!.render(scene, camera);
      dirty = false;
    }
    function localPoint(e: { clientX: number; clientY: number }): Point {
      const box = container!.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    }
    function setMoonAt(p: Point) {
      moon = clampMoon({ ...screenToScene(p, MOON_DEPTH, width, height, point), radius: moon.radius }, width, height, point);
      userPlaced = true;
      dirty = true;
    }
    function startReset() {
      reset = { from: { ...moon }, elapsed: 0 };
      userPlaced = true;
      dirty = true;
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || e.isPrimary === false || drag) return;
      const p = localPoint(e), visible = screenMoon(moon, width, height, point);
      reset = undefined;
      suppressClick = false;
      drag = { id: e.pointerId, start: p, offset: { x: p.x - visible.x, y: p.y - visible.y }, moved: false };
      button!.dataset.dragging = "true";
      button!.setPointerCapture?.(e.pointerId);
    };
    const follow = (x: number, y: number) => {
      if (drag || fallback) return;
      target.x = Math.max(-1, Math.min(1, (x / width - 0.5) * 2));
      target.y = Math.max(-1, Math.min(1, (y / height - 0.5) * 2));
    };
    const pointer = (e: PointerEvent) => {
      if (drag) {
        if (e.pointerId !== drag.id) return;
        const p = localPoint(e);
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
        if (drag.moved) setMoonAt({ x: p.x - drag.offset.x, y: p.y - drag.offset.y });
        return;
      }
      if (!finePointer.matches || e.pointerType === "touch") return;
      const p = localPoint(e);
      follow(p.x, p.y);
    };
    const up = (e: PointerEvent) => { if (e.pointerId === drag?.id) releaseDrag(); };
    const cancel = (e: PointerEvent) => { if (e.pointerId === drag?.id) releaseDrag(true); };
    const secondPointer = (e: PointerEvent) => {
      if (drag && e.pointerType === "touch" && e.pointerId !== drag.id) releaseDrag(true);
    };
    const click = (e: MouseEvent) => {
      const dragged = suppressClick;
      suppressClick = false;
      if (dragged && e.detail !== 0) return;
      coverage = mountainCoverage(moon, ridges, width, height, point);
      if (canResetMoon(coverage)) startReset();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Home") { e.preventDefault(); releaseDrag(true); startReset(); return; }
      const steps: { [key: string]: Point } = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const step = steps[e.key];
      if (!step) return;
      e.preventDefault();
      releaseDrag(true);
      reset = undefined;
      const p = screenMoon(moon, width, height, point), amount = e.shiftKey ? 32 : 8;
      setMoonAt({ x: p.x + step.x * amount, y: p.y + step.y * amount });
    };
    const leave = () => { target.x = target.y = 0; };
    const blur = () => { releaseDrag(true); leave(); };
    const touch = (e: TouchEvent) => {
      if (e.touches.length !== 1) { releaseDrag(true); leave(); return; }
      const p = localPoint(e.touches[0]);
      follow(p.x, p.y);
    };
    const visibility = () => { last = 0; if (document.hidden) releaseDrag(true); dirty = true; };
    const lost = (e: Event) => { e.preventDefault(); showFallback(); };
    try {
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: "low-power" });
      renderer.domElement.setAttribute("aria-hidden", "true");
      container.appendChild(renderer.domElement);
      container.dataset.renderer = "webgl";
      renderer.domElement.addEventListener("webglcontextlost", lost);
      resize();
      renderer.compile(scene, camera);
    } catch {
      fallback = true;
      resize();
    }
    frame = requestAnimationFrame(render);
    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 160);
    });
    observer.observe(container);
    button.addEventListener("pointerdown", down);
    button.addEventListener("lostpointercapture", cancel);
    button.addEventListener("click", click);
    button.addEventListener("keydown", key);
    window.addEventListener("pointerdown", secondPointer, true);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchstart", touch, { passive: true });
    window.addEventListener("touchmove", touch, { passive: true });
    window.addEventListener("touchend", leave, { passive: true });
    window.addEventListener("touchcancel", leave, { passive: true });
    window.addEventListener("blur", blur);
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      releaseDrag(true);
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      observer.disconnect();
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("lostpointercapture", cancel);
      button.removeEventListener("click", click);
      button.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", secondPointer, true);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchstart", touch);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("touchend", leave);
      window.removeEventListener("touchcancel", leave);
      window.removeEventListener("blur", blur);
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
  return <>
    <div className="landscape" ref={host} aria-hidden="true" />
    <button className="moon-control" ref={control} type="button" aria-label="Move moon" aria-describedby="moon-instructions" />
    <span className="sr-only" id="moon-instructions">Drag the moon, or use arrow keys to move it. Home returns it to its default position. Click to return when mountains hide more than 90 percent of it.</span>
  </>;
}
export default memo(Landscape);
