import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { drawFallback, paintLandscape, Painting } from "./painting";
import { createGeese, createFlightSchedule } from "./geese";

const vertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(3.4,7.2);a*=.5;}return v;}
`;
const skyFragment = `varying vec2 vUv;uniform float uTime;uniform float uAspect;${noise}
void main(){
 vec2 uv=vUv;float y=1.-uv.y;
 vec3 col=mix(vec3(.31,.43,.59),vec3(.66,.75,.77),smoothstep(0.,.85,y));
 col=mix(col,vec3(.73,.78,.75),smoothstep(.52,.9,y)*.4);
 vec2 p=vec2(uv.x*uAspect,uv.y);
 float clouds=fbm(p*3.8+vec2(uTime*.003,0.));
 float wisps=fbm(p*vec2(2.4,8.0)+vec2(-uTime*.002,1.));
 float edge=pow(abs(uv.x-.5)*2.,1.8);
 float cloud=smoothstep(.50,.77,clouds*.55+wisps*.45)*(.22+edge*.5);
 col=mix(col,vec3(.88,.80,.72),cloud*(1.-smoothstep(.5,.85,y)));
 float grain=(hash(gl_FragCoord.xy)-.5)*.019;
 col+=grain;
 gl_FragColor=vec4(col,1.);
}`;
const paintFragment = `varying vec2 vUv;uniform sampler2D uMap;uniform sampler2D uWindMap;uniform vec2 uSize;uniform float uTime;uniform float uKind;${noise}
void main(){
 vec2 uv=vUv;
 if(uKind>1.5){
  float flexibility=texture2D(uWindMap,vUv).r;
  float breeze=sin(uTime*.68+vUv.x*9.)*.72+sin(uTime*1.13+vUv.x*21.+vUv.y*5.)*.28;
  float flutter=sin(uTime*2.1+vUv.y*90.+vUv.x*44.)*.18;
  float amplitude=uKind>2.5?2.3:3.1;
  uv.x+=(breeze+flutter)*amplitude*flexibility/uSize.x;
  uv.y+=sin(uTime*.83+vUv.x*17.)*.45*flexibility/uSize.y;
 }
 else if(uKind>.5){
  float d=clamp((.295-uv.y)/.295,0.,1.);
  // Two counter-moving fields give the reflection a slow downstream current.
  float current=uTime*.045;
  uv.x+=(sin(uv.y*95.-current*3.+sin(uv.x*12.+current))*.0035
       +sin(uv.y*210.+uv.x*16.-current*5.)*.0012)*d;
  uv.y+=(sin(uv.x*23.-current*2.+uv.y*45.)*.0017)*d;
 }
 vec4 col=texture2D(uMap,uv);
 if(col.a<.003)discard;
 col.rgb+=(hash(gl_FragCoord.xy)-.5)*.022;
 if(uKind>.5&&uKind<1.5){
  float d=clamp((.295-vUv.y)/.295,0.,1.);
  vec2 flow=vec2(vUv.x*45.-uTime*.12,vUv.y*135.+uTime*.085);
  float patches=noise(flow);
  float wave=sin(vUv.y*470.+sin(vUv.x*22.-uTime*.22)*2.4-uTime*1.65);
  float secondary=sin(vUv.y*760.+vUv.x*15.+uTime*.95);
  float glint=smoothstep(.73,1.,wave)*smoothstep(.32,.72,patches);
  float trough=smoothstep(.65,1.,-wave)*.027;
  col.rgb+=(glint*.115+smoothstep(.94,1.,secondary)*.026-trough)*d;

 }
 gl_FragColor=col;
}`;
const mistFragment = `varying vec2 vUv;uniform float uTime;uniform float uAspect;${noise}
void main(){float fog=fbm(vec2(vUv.x*uAspect*2.+uTime*.007,vUv.y*18.));
float band=exp(-pow((vUv.y-.34)*15.,2.));
gl_FragColor=vec4(.73,.80,.79,band*smoothstep(.2,.8,fog)*.16);}`;

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
    ) {
      const uniforms: { [key: string]: THREE.IUniform } = {
        uTime: { value: elapsed },
        uAspect: { value: width / height },
        uKind: { value: kind },
        uSize: { value: new THREE.Vector2(width, height) },
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
                : 0,
          p.windMap,
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
      if (!moving && renderedStill) return;
      if (moving && last && now - last < 1000 / 30) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (moving) elapsed += dt;
      const lerp = 1 - Math.exp(-dt * 3.5);
      point.x += ((moving ? target.x : 0) - point.x) * lerp;
      point.y += ((moving ? target.y : 0) - point.y) * lerp;
      if (!moving) {
        point.x = 0;
        point.y = 0;
      }
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
        width = container.clientWidth;
        height = container.clientHeight;
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
