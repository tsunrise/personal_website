import { EYE_HEIGHT, WATER_HORIZON } from "./composition";
import { PLANT_DEPTH_RANGE, PLANT_LENGTH_RANGE } from "./plantMotion";
import { colorGLSL, moonRadianceGLSL } from "./lighting";
import { OVERSCAN } from "./moon";
import { cloudGLSL } from "./cloudShaders";
import { waterLightingGLSL, WATER_EXPOSURE } from "./waterLighting";

export const vertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(3.4,7.2);a*=.5;}return v;}
`;

export const skyFragment = `
varying vec2 vUv;
uniform float uAspect;
uniform vec2 uAirOffset;
uniform float uIncidentIntensity;
uniform float uAmbientGain;
${noise}
${colorGLSL}
${cloudGLSL}
void main(){
 vec3 col=linearToSrgb(skyBaseColor(vUv));
 col+=(hash(gl_FragCoord.xy)-.5)*.019;
 gl_FragColor=vec4(col,1.);
}`;

/** Clouds cover the lunar sprite once, before mountains cover both. */
export const cloudFragment = `
varying vec2 vUv;
uniform float uAspect;
uniform vec2 uAirOffset;
uniform float uIncidentIntensity;
uniform float uAmbientGain;
${colorGLSL}
${cloudGLSL}
void main(){
 vec4 cloud=cloudColor(vUv);
 gl_FragColor=vec4(linearToSrgb(cloud.rgb),cloud.a);
}`;

/** A cached mineral-painted sprite, positioned in actual viewport coordinates. */
export const moonFragment = `
varying vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uMountainMask;
uniform vec3 uMoonScreen;
uniform float uAspect;
uniform float uIncidentIntensity;
uniform float uAmbientGain;
uniform vec2 uAirOffset;
uniform vec2 uReferenceMoonSky;
${colorGLSL}
${cloudGLSL}
${moonRadianceGLSL}
void main(){
 vec2 relative=(vUv-uMoonScreen.xy)*vec2(uAspect,1.);
 vec2 sprite=relative/(uMoonScreen.z*6.)+.5;
 if(any(lessThan(sprite,vec2(0.)))||any(greaterThan(sprite,vec2(1.))))discard;
 vec4 col=texture2D(uMap,sprite);
 // Transport the moon's contrast above atmospheric airlight. Extinction must
 // soften it into the local sky, not turn its opaque disc or halo toward black.
 vec2 skyUv=.5+(vUv-.5)/${OVERSCAN};
 vec3 sky=skyBaseColor(skyUv);
 vec3 referenceSky=skyBaseColor(skyUv+uReferenceMoonSky-uMoonSky)/uAmbientGain;
 col.rgb=linearToSrgb(moonRadiance(srgbToLinear(col.rgb),sky,referenceSky,uIncidentIntensity));
 col.a*=1.-texture2D(uMountainMask,vUv).a;
 if(col.a<.001)discard;
 gl_FragColor=col;
}`;

// A small directional spectrum relative to the night's initial breeze. Once
// oriented, wavevectors stay fixed; veering changes their relative energy.
// omega² = (g*k + surfaceTension/density*k³) * tanh(k*depth).
const waves = [
  [0.02, 1.8, 0.006, 0.7],
  [0.48, 0.97, 0.0048, 2.1],
  [0.91, 0.53, 0.0034, 4.3],
  [1.34, 0.29, 0.0022, 1.6],
  [1.78, 0.16, 0.0012, 5.2],
  [0.66, 0.087, 0.00065, 3.4],
];
const spectrum = waves
  .map(([angle, wavelength, amplitude, phase]) => {
    const relativeAngle = angle - 0.65;
    const k = (2 * Math.PI) / wavelength;
    const omega = Math.sqrt((9.81 * k + 0.000074 * k ** 3) * Math.tanh(k * 1.8));
    return `addWave(slope,world,footprint,vec2(${Math.cos(relativeAngle).toFixed(7)},${Math.sin(relativeAngle).toFixed(7)}),${k.toFixed(7)},${amplitude.toFixed(7)},${omega.toFixed(7)},${phase.toFixed(7)});`;
  })
  .join("\n");

export const paintFragment = `
varying vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uWindMap;
uniform sampler2D uShadowMap;
uniform sampler2D uNormalMap;
uniform vec2 uShadowOffset;
uniform vec2 uSkyOffset;
uniform vec2 uSize;
uniform float uAspect;
uniform float uTime;
uniform float uKind;
uniform vec2 uWind;
uniform vec2 uAirOffset;
uniform vec2 uWillow;
uniform vec2 uReeds;
uniform vec2 uWaterWind;
uniform vec2 uWaveBasis;
uniform float uWaterEnergy;
uniform vec2 uCurrentOffset;
uniform vec3 uMoon;
uniform vec3 uLightDirection;
uniform vec3 uDefaultLightDirection;
uniform float uMoonVisibility;
uniform float uIncidentIntensity;
uniform float uDirectIntensity;
uniform float uAmbientGain;
uniform vec3 uSourceDirection;
uniform vec3 uSourceTangentX;
uniform vec3 uSourceTangentY;
uniform vec3 uSourceCovariance;
uniform float uLightStrength;
uniform float uTwoSided;
const float horizon=${WATER_HORIZON};
const float eyeHeight=${EYE_HEIGHT};
${noise}
${colorGLSL}
${cloudGLSL}
${waterLightingGLSL}
// Reconstruct a point on the painted plant in camera space, bend it in world
// X/Z, then divide by its new depth. The same virtual camera views the water.
vec2 projectPlant(vec2 rest,vec3 mask,vec2 load,bool reed){
 float flexibility=pow(mask.r,1.3);
 float depth=max(mask.g*${PLANT_DEPTH_RANGE.toFixed(1)},1.);
 float reach=mask.b*${PLANT_LENGTH_RANGE.toFixed(1)};
 // Softer stems make the same gentle breeze easier to see; keep all motion
 // in world space so perspective and the reach constraint still apply.
 vec2 bend=load*(reed?.0325:.0365)*flexibility;
 // Keep the root-to-point reach: hanging shoots rise and upright reeds lower
 // slightly as they bend, including when the wind is purely along camera Z.
 float travel=length(bend);
 bend*=min(1.,.28*reach/max(travel,.00001));
 float shortening=reach-sqrt(max(reach*reach-dot(bend,bend),0.));
 float vertical=reed?-shortening:shortening;
 vec2 principal=vec2(.5,horizon);
 vec2 projected=principal+((rest-principal)*depth+
   vec2(bend.x/uAspect,vertical))/(depth+bend.y);
 return projected;
}
void addWave(inout vec2 slope,vec2 world,vec2 footprint,vec2 direction,float k,float amplitude,float omega,float phase){
 direction=vec2(uWaveBasis.x*direction.x-uWaveBasis.y*direction.y,
   uWaveBasis.y*direction.x+uWaveBasis.x*direction.y);
 vec2 windDirection=uWaterWind/max(length(uWaterWind),.001);
 float alignment=max(dot(direction,windDirection),0.);
 float energy=sqrt(max(uWaterEnergy,0.))*(.16+.84*pow(alignment,4.));
 // Suppress waves smaller than a few pixels in the distance, preventing shimmer.
 float resolved=1.-smoothstep(.8,2.7,k*dot(abs(direction),footprint));
 float theta=k*dot(direction,world-uCurrentOffset)-omega*uTime+phase;
 slope+=direction*(amplitude*k*energy*resolved*cos(theta));
}
void main(){
 vec2 uv=vUv;
 bool water=(uKind>.5&&uKind<1.5)||uKind>3.5;
 vec2 slope=vec2(0.);
 vec3 view=vec3(0.,1.,0.);
 float distanceBelow=max(horizon-vUv.y,.018);
 float waterFade=smoothstep(0.,.065,horizon-vUv.y);
 if(uKind>1.5&&uKind<3.5){
  bool reed=uKind>2.5;
  vec2 bend=reed?uReeds:uWillow;
  vec2 airSample=vec2(vUv.x*uAspect,vUv.y)*5.-uAirOffset*.075;
  // Keep the hanging willow closer to vertical: reduce its sustained bend,
  // while retaining the same spatial gust variation and leaf flutter.
  float shelter=(reed?.74:.34)+.52*noise(airSample);
  float flutter=(noise(airSample*5.-uAirOffset*.24)-.5)*length(uWind)*.40;
  vec2 direction=uWind/max(length(uWind),.001);
  vec2 load=bend*shelter+direction*flutter;
  // Invert the small perspective deformation to sample the resting artwork.
  // Two iterations include the changed depth/flexibility at the source point.
  for(int i=0;i<2;i++){
   vec3 mask=texture2D(uWindMap,uv).rgb;
   uv=vUv-(projectPlant(uv,mask,load,reed)-uv);
  }
 }else if(water&&vUv.y<horizon){
  // Ray/plane intersection in metres, eye 1.4 m above the river. This naturally
  // compresses ripples at the horizon rather than spacing them evenly on screen.
  vec2 ray=vec2((vUv.x-.5)*uAspect,1.);
  vec2 world=ray*eyeHeight/distanceBelow;
  vec2 footprint=vec2(eyeHeight*uAspect/(distanceBelow*uSize.x),
    eyeHeight/(distanceBelow*distanceBelow*uSize.y));
  ${spectrum}
  slope*=waterFade;
  view=normalize(vec3(-world.x,eyeHeight,-world.y));
  // Distort reflected scenery with the same normals that produce moon glints.
  uv+=vec2(slope.x*.018,slope.y*.012)*waterFade;
 }
 vec4 col=texture2D(uMap,uv);
 if(col.a<.003)discard;
 col.rgb=srgbToLinear(col.rgb);
 float gain=uAmbientGain;
 if(uLightStrength>0.){
  vec4 encoded=texture2D(uNormalMap,uv);
  if(encoded.a>.003){
   vec3 surfaceNormal=normalize(encoded.rgb*2.-1.);
   float current=dot(surfaceNormal,uLightDirection);
   float reference=dot(surfaceNormal,uDefaultLightDirection);
   if(uTwoSided>.5){
    current=max(current,0.)+.3*max(-current,0.);
    reference=max(reference,0.)+.3*max(-reference,0.);
   }else{
    current=max(current,0.);
    reference=max(reference,0.);
   }
   float ambient=1.-uLightStrength;
   gain=(ambient*uAmbientGain+uLightStrength*current*uDirectIntensity)/
     (ambient+uLightStrength*reference);
  }
 }
 col.rgb*=gain;
 if(water&&uKind<1.5&&waterFade>0.){
  float shade=texture2D(uShadowMap,uv-uShadowOffset).a;
  vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
  float fresnel=.02+.98*pow(1.-max(dot(normal,view),0.),5.);
  vec3 reflected=reflect(-view,normal);
  vec2 skyUv=vec2(.5,horizon)+vec2(reflected.x/uAspect,reflected.y)/max(reflected.z,.05)+uSkyOffset;
  vec3 sky=skyColor(clamp(skyUv,vec2(-.5,0.),vec2(1.5,1.5)));
  col.rgb=mix(col.rgb,sky,fresnel*.28*waterFade);
  col.rgb+=srgbToLinear(vec3(.38,.48,.50))*dot(slope,vec2(.3,.7))*.32*uAmbientGain;
  // The bridge blocks light: retain the water's own color and wave detail,
  // darken its diffuse illumination gently, and suppress direct moon glints.
  float moonGlint=moonSpecular(view,normal,uSourceDirection,uSourceTangentX,
    uSourceTangentY,uSourceCovariance,uWaterWind,uWaterEnergy);
  col.rgb+=srgbToLinear(vec3(.94,.88,.69))*moonGlint*${WATER_EXPOSURE}*waterFade*(1.-shade)*uDirectIntensity;
 }
 col.rgb=linearToSrgb(max(col.rgb,vec3(0.)));
 col.rgb+=(hash(gl_FragCoord.xy)-.5)*.018;
 gl_FragColor=col;
}`;

export const mistFragment = `
varying vec2 vUv;uniform float uAspect;uniform vec2 uAirOffset;
uniform float uAmbientGain;
${noise}
${colorGLSL}
void main(){
 vec2 p=vec2(vUv.x*uAspect,vUv.y)-uAirOffset*vec2(.001,.00008);
 float fog=fbm(p*vec2(2.,18.));
 float band=exp(-pow((vUv.y-.34)*15.,2.));
 gl_FragColor=vec4(linearToSrgb(srgbToLinear(vec3(.73,.80,.79))*uAmbientGain),band*smoothstep(.2,.8,fog)*.16);
}`;
