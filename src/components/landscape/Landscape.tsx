import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { drawFallback, paintLandscape, Painting } from "./painting";
import { paintBridgeWaterShadow } from "./bridge";
import { createGeese, createFlightSchedule } from "./geese";
import { createWind } from "./wind";
import { moonPosition, WATER_HORIZON } from "./composition";
import { CLOUD_MIN_RISE, cloudTransmission, getCloudAtlas } from "./clouds";
import { LightingState, sampleLighting } from "./lighting";
import {
  canResetMoon, clampMoon, interpolateMoon, Moon, moonLight, MOON_DEPTH,
  mountainCoverage, OVERSCAN, paintMountainMask, Point, RESET_SECONDS,
  Ridge, screenMoon, screenToScene,
} from "./moon";
import { Coverage, measureCells, occlusion, rectCells, toCoverage, UvRect } from "./coverage";
import { vertex, skyFragment, cloudFragment, paintFragment, moonFragment, mistFragment } from "./shaders";

const FRAME_INTERVAL = 1000 / 60;
const BRIDGE_DEPTH = 4;
const FULL: UvRect = { x0: 0, y0: 0, x1: 1, y1: 1 };
// Cloud optical depth is zero below this sky UV; mist is invisible outside its band.
const CLOUD_RECT: UvRect = { x0: 0, y0: WATER_HORIZON + CLOUD_MIN_RISE, x1: 1, y1: 1 };
const MIST_RECT: UvRect = { x0: 0, y0: 0.18, x1: 1, y1: 0.5 };

/** A full-plane quad trimmed to a UV rectangle; each pixel keeps the same vUv. */
function setQuad(geometry: THREE.BufferGeometry, { x0, y0, x1, y1 }: UvRect) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  [[x0, y1], [x1, y1], [x0, y0], [x1, y0]].forEach(([x, y], i) => {
    position.setXYZ(i, x * 2 - 1, y * 2 - 1, 0);
    uv.setXY(i, x, y);
  });
  position.needsUpdate = uv.needsUpdate = true;
  geometry.computeBoundingSphere();
}
function quad(rect: UvRect) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(12, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(8, 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  setQuad(geometry, rect);
  return geometry;
}

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
    let nextFrame = 0;
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
    const geometries: THREE.BufferGeometry[] = [];
    let moonGeometry: THREE.BufferGeometry | undefined;
    // Painting canvases are freed once uploaded; the Canvas fallback repaints them.
    let released = false;
    const crops: HTMLCanvasElement[] = [];
    const materials: THREE.ShaderMaterial[] = [];
    const textures: THREE.Texture[] = [];
    const layers: { mesh: THREE.Mesh; depth: number; moon: boolean }[] = [];
    let geese: ReturnType<typeof createGeese> | undefined;
    const flightSchedule = createFlightSchedule();
    const wind = createWind();
    const shadowOffset = { value: new THREE.Vector2() };
    const skyOffset = { value: new THREE.Vector2() };
    const cloudMap: { value: THREE.DataTexture | null } = { value: null };
    const waveBoundary: { value: THREE.DataTexture | null } = { value: null };
    let illumination: LightingState;
    const light = {
      uMoon: { value: new THREE.Vector3() },
      uMoonScreen: { value: new THREE.Vector3() },
      uLightDirection: { value: new THREE.Vector3() },
      uDefaultLightDirection: { value: new THREE.Vector3() },
      uMoonVisibility: { value: 1 },
      uMoonSky: { value: new THREE.Vector2() },
      uReferenceMoonSky: { value: new THREE.Vector2() },
      uIncidentIntensity: { value: 1 },
      uDirectIntensity: { value: 1 },
      uAmbientGain: { value: 1 },
      uSourceDirection: { value: new THREE.Vector3() },
      uSourceTangentX: { value: new THREE.Vector3() },
      uSourceTangentY: { value: new THREE.Vector3() },
      uSourceCovariance: { value: new THREE.Vector3() },
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
      uCloudBasis: { value: new THREE.Vector2() },
      uCloudPhase: { value: new THREE.Vector4() },
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
      geometries.splice(0).forEach((g) => g.dispose());
      moonGeometry = undefined;
      textures.splice(0).forEach((t) => t.dispose());
      layers.length = 0;
      maskTexture = shadowTexture = undefined;
      cloudMap.value = waveBoundary.value = null;
    }
    function texture(canvas: HTMLCanvasElement) {
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.NoColorSpace;
      // Paintings are drawn at or above display density, so mipmaps would go
      // unused while adding a third more memory and upload work.
      map.generateMipmaps = false;
      map.minFilter = THREE.LinearFilter;
      textures.push(map);
      return map;
    }
    function coverageTexture({ data, columns, rows }: Coverage) {
      const map = new THREE.DataTexture(data, columns, rows, THREE.RedFormat, THREE.UnsignedByteType);
      map.colorSpace = THREE.NoColorSpace;
      map.minFilter = map.magFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
      map.unpackAlignment = 1;
      map.needsUpdate = true;
      textures.push(map);
      return map;
    }
    /** Copies a painting's content rectangle on the same texel grid. */
    function cropped(canvas: HTMLCanvasElement, [x, y, w, h]: number[]) {
      if (x === 0 && y === 0 && w === canvas.width && h === canvas.height) return canvas;
      const copy = document.createElement("canvas");
      copy.width = w;
      copy.height = h;
      copy.getContext("2d")?.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      crops.push(copy);
      return copy;
    }
    function plane(fragmentShader: string, order: number, depth: number, painting?: Painting,
      rect: UvRect | null = FULL, cells?: Coverage, crop: UvRect = FULL) {
      const isMoon = painting?.kind === "moon";
      const kind = painting?.kind === "water" ? 1 : painting?.kind === "willow" ? 2
        : painting?.kind === "reeds" ? 3 : painting?.kind === "shallows" ? 4 : 0;
      const uniforms: { [key: string]: THREE.IUniform } = {
        ...weather, ...light,
        uTime: { value: elapsed }, uAspect: { value: width / height },
        uKind: { value: kind }, uSize: { value: new THREE.Vector2(width, height) },
        uShadowOffset: shadowOffset,
        uWaveBoundary: waveBoundary,
        // The edge field shares the bridge's depth-4 parallax.
        uBoundaryParallax: { value: BRIDGE_DEPTH - depth },
        uSkyOffset: skyOffset,
        uCloudMap: cloudMap,
        uMountainMask: { value: maskTexture },
        uLightStrength: { value: painting?.lightStrength ?? 0 },
        uTwoSided: { value: painting?.twoSided ? 1 : 0 },
      };
      if (painting) {
        // Upload only the content rectangle, snapped to whole painting texels.
        const { width: w, height: h } = painting.canvas;
        const x = Math.floor(crop.x0 * w), y = Math.floor((1 - crop.y1) * h);
        const pixels = [x, y, Math.max(1, Math.ceil(crop.x1 * w) - x), Math.max(1, Math.ceil((1 - crop.y0) * h) - y)];
        uniforms.uCrop = { value: new THREE.Vector4(x / w, 1 - (y + pixels[3]) / h, pixels[2] / w, pixels[3] / h) };
        uniforms.uMap = { value: texture(cropped(painting.canvas, pixels)) };
        uniforms.uNormalMap = { value: painting.normalMap ? texture(cropped(painting.normalMap, pixels)) : uniforms.uMap.value };
        if (painting.windMap) uniforms.uWindMap = { value: texture(cropped(painting.windMap, pixels)) };
        if (painting.shadowMap) {
          shadowTexture = texture(painting.shadowMap);
          uniforms.uShadowMap = { value: shadowTexture };
        }
      }
      if (cells) uniforms.uCoverage = { value: coverageTexture(cells) };
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex, fragmentShader, uniforms, transparent: order !== 0,
        depthTest: false, depthWrite: false,
      });
      materials.push(material);
      const geometry = quad(rect ?? FULL);
      geometries.push(geometry);
      if (isMoon) moonGeometry = geometry;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = !!rect;
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
      if (moonGeometry) {
        // Rasterize only the sprite square instead of discarding the whole screen.
        const { x, y, z } = light.uMoonScreen.value, reach = z * 3;
        setQuad(moonGeometry, {
          x0: x - reach * height / width, x1: x + reach * height / width, y0: y - reach, y1: y + reach,
        });
      }
      light.uLightDirection.value.fromArray(currentLight.direction);
      light.uDefaultLightDirection.value.fromArray(reference.direction);
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
    // Weather can cover a stationary moon: energy must not share the geometry cache.
    function updateIllumination() {
      const air = { x: wind.state.displacement.x, y: wind.state.displacement.z };
      illumination = sampleLighting(moon, ridges, width, height, point,
        (uv) => cloudTransmission(uv, width / height, air));
      const visible = screenMoon(moon, width, height, point);
      const skyMoon = screenToScene(visible, 0, width, height);
      light.uMoonSky.value.set(skyMoon.x, skyMoon.y);
      const referenceSky = screenToScene(screenMoon(moonPosition(width, height), width, height, point), 0, width, height);
      light.uReferenceMoonSky.value.set(referenceSky.x, referenceSky.y);
      light.uMoonVisibility.value = illumination.transmission;
      light.uIncidentIntensity.value = illumination.incidentIntensity;
      light.uDirectIntensity.value = illumination.directIntensity;
      light.uAmbientGain.value = illumination.ambientGain;
      light.uSourceDirection.value.fromArray(illumination.sourceDirection);
      light.uSourceTangentX.value.fromArray(illumination.tangentX);
      light.uSourceTangentY.value.fromArray(illumination.tangentY);
      light.uSourceCovariance.value.fromArray(illumination.covariance);
      skyOffset.value.set(point.x * 3 / (width * OVERSCAN), -point.y * 3 / (height * OVERSCAN));
    }
    function composeFallback() {
      if (!fallbackCanvas) return;
      const visible = screenMoon(moon, width, height, point);
      drawFallback(fallbackCanvas, paintings, {
        moon: { x: visible.x / width, y: 1 - visible.y / height, radius: visible.radius / height },
        direction: light.uLightDirection.value.toArray(),
        referenceDirection: light.uDefaultLightDirection.value.toArray(),
        illumination, mountainMask, parallax: point,
        air: { x: wind.state.displacement.x, y: wind.state.displacement.z },
        moonSky: { x: light.uMoonSky.value.x, y: light.uMoonSky.value.y },
        referenceMoonSky: { x: light.uReferenceMoonSky.value.x, y: light.uReferenceMoonSky.value.y },
        waterWind: [wind.state.water.x, wind.state.water.z], waterEnergy: wind.state.waterEnergy,
      });
    }
    function showFallback() {
      if (disposed) return;
      fallback = true;
      clearScene();
      if (released || !paintings.some((p) => p.fallback)) paint();
      if (!fallbackCanvas) {
        fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.setAttribute("aria-hidden", "true");
        container!.appendChild(fallbackCanvas);
      }
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      updateMoon(true);
      updateIllumination();
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
    function paint() {
      const scale = Math.min(1.5, 1600 / width, 1400 / height);
      paintings = paintLandscape(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), fallback);
      ridges = paintings.filter((p) => p.ridge).map((p) => ({ points: p.ridge!, depth: p.depth }));
      mountainMask.width = Math.max(1, Math.round(width * Math.min(scale, 1)));
      mountainMask.height = Math.max(1, Math.round(height * Math.min(scale, 1)));
      released = false;
    }
    /** Uploads every painting now, then frees the canvases that stay unchanged. */
    function releasePaintings() {
      textures.forEach((map) => { if (map instanceof THREE.CanvasTexture) renderer!.initTexture?.(map); });
      const kept = new Set<HTMLCanvasElement>([mountainMask]);
      paintings.forEach((p) => { if (p.shadowMap) kept.add(p.shadowMap); });
      paintings.flatMap((p) => [p.canvas, p.normalMap, p.windMap]).concat(crops.splice(0)).forEach((canvas) => {
        if (canvas && !kept.has(canvas)) canvas.width = canvas.height = 0;
      });
      released = true;
    }
    function resize() {
      if (disposed) return;
      const box = container!.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(box.width));
      const nextHeight = Math.max(1, Math.round(box.height));
      // ResizeObserver also reports the initial size; never rebuild an unchanged scene.
      if (paintings.length && nextWidth === width && nextHeight === height) return;
      releaseDrag(true);
      width = nextWidth;
      height = nextHeight;
      const initial = moonPosition(width, height);
      moon = clampMoon(userPlaced ? { ...moon, radius: initial.radius } : initial, width, height, point);
      if (reset) reset = { from: moon, elapsed: 0 };
      paint();
      dirty = true;
      if (fallback) { showFallback(); return; }
      clearScene();
      renderer!.setSize(width, height, false);
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      maskTexture = texture(mountainMask);
      const atlas = getCloudAtlas();
      weather.uCloudBasis.value.fromArray(atlas.basis);
      weather.uCloudPhase.value.fromArray(atlas.phase);
      cloudMap.value = new THREE.DataTexture(atlas.data, atlas.size, atlas.size, THREE.RGBAFormat);
      cloudMap.value.colorSpace = THREE.NoColorSpace;
      cloudMap.value.wrapS = cloudMap.value.wrapT = THREE.RepeatWrapping;
      // Perspective compresses distant cloud toward the horizon. Mipmaps
      // prefilter only there; the upper sky is magnified and matches the CPU.
      cloudMap.value.magFilter = THREE.LinearFilter;
      cloudMap.value.minFilter = THREE.LinearMipmapLinearFilter;
      cloudMap.value.anisotropy = Math.min(8, renderer!.capabilities?.getMaxAnisotropy?.() ?? 1);
      cloudMap.value.generateMipmaps = true;
      cloudMap.value.flipY = false;
      cloudMap.value.needsUpdate = true;
      textures.push(cloudMap.value);
      const edges = paintings.find((p) => p.waveBoundary)?.waveBoundary;
      if (edges) {
        // Half floats keep centimetre wave phase and remain linearly filterable.
        const half = new Uint16Array(edges.data.length);
        edges.data.forEach((value, i) => { half[i] = THREE.DataUtils.toHalfFloat(value); });
        waveBoundary.value = new THREE.DataTexture(half, edges.width, edges.height, THREE.RGBAFormat, THREE.HalfFloatType);
        waveBoundary.value.colorSpace = THREE.NoColorSpace;
        waveBoundary.value.minFilter = waveBoundary.value.magFilter = THREE.LinearFilter;
        waveBoundary.value.generateMipmaps = false;
        waveBoundary.value.needsUpdate = true;
        textures.push(waveBoundary.value);
      }
      plane(skyFragment, 0, 0);
      geese = createGeese(scene, flightSchedule);
      // Shade only cells a layer can draw into and no later opaque layer hides.
      const layered = paintings.filter((p) => p.kind !== "moon");
      const { columns, rows, layers: cells } = measureCells(layered[0].canvas.width, layered[0].canvas.height,
        layered.map((p) => ({
          // Plants draw only where their artwork or wind mask is nonzero.
          sources: p.windMap ? [p.canvas, p.windMap] : [p.canvas],
          // Displaced plants and translucent shallows never hide what is beneath.
          occluder: p.kind === "paint" || p.kind === "water",
        })));
      const hiddenBelow = occlusion(layered.map((p, i) => ({ order: paintings.indexOf(p) + 1, opaque: cells[i].opaque })),
        columns, rows);
      paintings.forEach((p, i) => {
        if (p.kind === "moon") { plane(moonFragment, i + 1, p.depth, p); return; }
        const { occupied } = cells[layered.indexOf(p)];
        // Water layers dilate further: their wave distortion samples a few pixels away.
        const dilation = p.kind === "water" || p.kind === "shallows" ? 2 : 1;
        const shaded = toCoverage(occupied, columns, rows, dilation, hiddenBelow(i + 1));
        const content = toCoverage(occupied, columns, rows, dilation).bounds;
        plane(paintFragment, i + 1, p.depth, p, shaded.bounds, shaded, content ?? FULL);
      });
      const cloud = toCoverage(rectCells(CLOUD_RECT, columns, rows), columns, rows, 0, hiddenBelow(1.25));
      plane(cloudFragment, 1.25, 0, undefined, cloud.bounds, cloud);
      const mist = toCoverage(rectCells(MIST_RECT, columns, rows), columns, rows, 0, hiddenBelow(5.5));
      plane(mistFragment, 5.5, 3, undefined, mist.bounds, mist);
      updateMoon(true);
      updateIllumination();
      releasePaintings();
    }
    function render(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (document.hidden) { last = nextFrame = 0; return; }
      // Allow timestamp jitter and retain the cadence on high-refresh displays.
      if (now + 1 < nextFrame) return;
      nextFrame = nextFrame
        ? nextFrame + Math.max(1, Math.floor((now - nextFrame) / FRAME_INTERVAL) + 1) * FRAME_INTERVAL
        : now + FRAME_INTERVAL;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (reset) {
        reset.elapsed += dt;
        moon = interpolateMoon(reset.from, moonPosition(width, height), reset.elapsed);
        if (reset.elapsed >= RESET_SECONDS) { reset = undefined; userPlaced = false; }
        dirty = true;
      }
      if (fallback) {
        if (dirty) { updateMoon(); updateIllumination(); composeFallback(); dirty = false; }
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
      updateIllumination();
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
    const visibility = () => { last = nextFrame = 0; if (document.hidden) releaseDrag(true); dirty = true; };
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
