import { CLOUD_ANCHOR, CLOUD_HAZE, CLOUD_LAYERS, CLOUD_MIN_RISE } from "./clouds";
import { WATER_HORIZON } from "./composition";

const f = (value: number) => Number.isInteger(value) ? `${value}.` : `${value}`;
const [near, far] = CLOUD_LAYERS;

/** Counterpart of clouds.ts; all radiance is linear and all metadata stays linear. */
export const cloudGLSL = `
uniform sampler2D uCloudMap;
uniform vec2 uMoonSky;
uniform vec2 uCloudBasis;
uniform vec4 uCloudPhase;

vec3 cloudLinear(vec3 color){
 return mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
}
float cloudLayerDepth(vec2 uv,bool farLayer){
 float rise=uv.y-${f(WATER_HORIZON)};
 if(rise<=${f(CLOUD_MIN_RISE)})return 0.;
 // Project onto a flat layer through the water camera, then drift with the
 // winds aloft. Atlas X runs along the night's prevailing axis.
 float z=(farLayer?${f(far.altitude)}:${f(near.altitude)})/rise;
 vec2 p=vec2((uv.x-${f(CLOUD_ANCHOR)})*uAspect*z,z)-uAirOffset*(farLayer?${f(far.drift)}:${f(near.drift)});
 p=vec2(dot(p,uCloudBasis),p.y*uCloudBasis.x-p.x*uCloudBasis.y)/(farLayer?${f(far.tile)}:${f(near.tile)});
 p+=farLayer?uCloudPhase.zw:uCloudPhase.xy;
 vec4 cloudSample=texture2D(uCloudMap,p);
 // Aerial perspective through the hazy boundary layer, normalized at the frame top.
 float haze=smoothstep(${f(CLOUD_MIN_RISE)},${f(CLOUD_MIN_RISE * 3)},rise)
  *exp(min(0.,-${f(CLOUD_HAZE)}*(1./rise-${f(1 / (1 - WATER_HORIZON))})));
 return (farLayer?cloudSample.g:cloudSample.r)*2.*haze;
}
vec2 cloudDepths(vec2 uv){
 return vec2(cloudLayerDepth(uv,false),cloudLayerDepth(uv,true));
}
vec3 skyBaseColor(vec2 uv){
 float y=1.-uv.y;
 vec3 col=mix(vec3(.31,.43,.59),vec3(.66,.75,.77),smoothstep(0.,.85,y));
 col=mix(col,vec3(.73,.78,.75),smoothstep(.52,.9,y)*.4);
 return cloudLinear(col)*uAmbientGain;
}
vec4 cloudColor(vec2 uv){
 vec2 depth=cloudDepths(uv);
 vec2 transmission=exp(-depth);
 float alpha=1.-transmission.x*transmission.y;
 if(alpha<.00001)return vec4(0.);
 // The far stratum spans a shallow slab. Parallel moon rays enter that slab
 // at these projected points and attenuate light reaching its near neighbor.
 float incomingDepth=0.;
 incomingDepth+=cloudLayerDepth(mix(uv,uMoonSky,.04/1.04),true)*.25;
 incomingDepth+=cloudLayerDepth(mix(uv,uMoonSky,.055/1.055),true)*.25;
 incomingDepth+=cloudLayerDepth(mix(uv,uMoonSky,.07/1.07),true)*.25;
 incomingDepth+=cloudLayerDepth(mix(uv,uMoonSky,.085/1.085),true)*.25;
 vec2 delta=(uv-uMoonSky)*vec2(uAspect,1.);
 float forward=1./(1.+dot(delta,delta)/.018);
 float scattering=max(uIncidentIntensity,0.)*(.015+.32*forward*forward);
 float nearLight=scattering*exp(-.5*depth.x-incomingDepth);
 float farLight=scattering*exp(-.5*depth.y);
 float nearDiffuse=exp(-.9*depth.x-.55*incomingDepth);
 float farDiffuse=exp(-.75*depth.y);
 vec3 pearl=cloudLinear(vec3(.83,.85,.85));
 vec3 moon=cloudLinear(vec3(.91,.94,.93));
 vec3 nearColor=mix(cloudLinear(vec3(.40,.50,.64)),pearl,nearDiffuse)*uAmbientGain+moon*nearLight;
 vec3 farColor=mix(cloudLinear(vec3(.48,.57,.68)),pearl,farDiffuse)*uAmbientGain+moon*farLight;
 vec3 color=(nearColor*(1.-transmission.x)+farColor*transmission.x*(1.-transmission.y))/alpha;
 return vec4(color,alpha);
}
vec3 skyColor(vec2 uv){
 vec4 cloud=cloudColor(uv);
 return mix(skyBaseColor(uv),cloud.rgb,cloud.a);
}
`;
