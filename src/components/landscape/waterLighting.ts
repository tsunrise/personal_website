import { WATER_HORIZON } from "./composition";

/** Artistic exposure only; source flux and the reflection distribution stay separate. */
export const WATER_EXPOSURE = 0.015;

export interface WaterLightSource {
  direction: readonly number[];
  /** Unit tangent vectors at direction; covariance is [xx, xy, yy] in this basis. */
  tangentX: readonly number[];
  tangentY: readonly number[];
  covariance: readonly number[];
}

type Vector = readonly number[];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalized = (v: Vector) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const cross = (a: Vector, b: Vector) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Beckmann Smith G1 / cos(theta), evaluated without a grazing-angle division. */
function smithRatio(cosine: number, tangent: number, bitangent: number, sx: number, sy: number) {
  const projected = Math.sqrt(2 * (sx * sx * tangent * tangent + sy * sy * bitangent * bitangent));
  if (projected < 1e-8) return 1 / Math.max(cosine, 1e-8);
  const a = cosine / projected;
  if (a >= 1.6) return 1 / Math.max(cosine, 1e-8);
  return (3.535 + 2.181 * a) / (projected * (1 + 2.276 * a + 2.577 * a * a));
}

/**
 * Integrated-source BRDF × N·L, excluding source flux, color, exposure and shadow.
 * The visible source is moment-matched to a Gaussian, then convolved with the
 * unresolved Beckmann slopes. Resolved waves are already represented by normal.
 * Wind is [world X, world Z]. No source-area factor belongs in this response.
 */
export function waterSpecular(
  view: Vector,
  normal: Vector,
  source: WaterLightSource,
  wind: Vector,
  energy: number,
) {
  const v = normalized(view), n = normalized(normal), l = normalized(source.direction);
  const nv = dot(n, v), nl = dot(n, l);
  if (nv <= 1e-6 || nl <= 1e-6) return 0;

  const axis = Math.hypot(wind[0], wind[1]) > 1e-6 ? [wind[0], 0, wind[1]] : [1, 0, 0];
  const projection = dot(axis, n);
  let t = axis.map((value, i) => value - projection * n[i]);
  if (dot(t, t) < 1e-8) t = cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]);
  t = normalized(t);
  const b = cross(n, t);
  const rawHalf = v.map((value, i) => value + l[i]);
  const halfLength = Math.hypot(...rawHalf);
  if (halfLength < 1e-6) return 0;
  const hn = Math.max(dot(rawHalf, n), 1e-6);
  const slopeX = dot(rawHalf, t) / hn, slopeY = dot(rawHalf, b) / hn;

  // d(half-vector slope)/d(source tangent displacement). Using the unnormalized
  // half-vector avoids both a normalization derivative and a source-size fudge.
  const jacobian = (e: Vector) => {
    const en = dot(e, n);
    return [(dot(e, t) - slopeX * en) / hn, (dot(e, b) - slopeY * en) / hn];
  };
  const jx = jacobian(source.tangentX), jy = jacobian(source.tangentY);
  const cxx = Math.max(source.covariance[0], 0), cyy = Math.max(source.covariance[2], 0);
  const cxyLimit = Math.sqrt(cxx * cyy);
  const cxy = Math.max(-cxyLimit, Math.min(cxyLimit, source.covariance[1]));
  const covariance = (x: number, y: number, z: number, w: number) =>
    cxx * x * z + cxy * (x * w + y * z) + cyy * y * w;
  // These are slope standard deviations; Beckmann alpha is sqrt(2) times sigma.
  const sx = 0.045 + 0.014 * Math.sqrt(Math.max(energy, 0)), sy = sx * 0.78;
  const sourceXX = covariance(jx[0], jy[0], jx[0], jy[0]);
  const sourceYY = covariance(jx[1], jy[1], jx[1], jy[1]);
  const xx = sx * sx + sourceXX;
  const xy = covariance(jx[0], jy[0], jx[1], jy[1]);
  // Expanding det(intrinsic + J source Jᵀ) avoids subtracting nearly equal
  // enormous numbers when a narrow visible crescent projects at grazing angles.
  const sourceDeterminant = Math.max(cxx * cyy - cxy * cxy, 0);
  const jacobianDeterminant = dot(cross(source.tangentX, source.tangentY), rawHalf) / (hn * hn * hn);
  const determinant = Math.max(sx * sx * sy * sy + sx * sx * sourceYY + sy * sy * sourceXX +
    sourceDeterminant * jacobianDeterminant * jacobianDeterminant, 1e-12);
  const residual = slopeY - xy / xx * slopeX;
  const exponent = slopeX * slopeX / xx + residual * residual * xx / determinant;
  const slopeDensity = Math.exp(-0.5 * exponent) / (2 * Math.PI * Math.sqrt(determinant));
  const nh = Math.max(hn / halfLength, 1e-6);
  const distribution = slopeDensity / (nh * nh * nh * nh);
  const vh = Math.max(0, Math.min(1, dot(v, rawHalf) / halfLength));
  const fresnel = 0.02037 + 0.97963 * (1 - vh) ** 5;
  // Source spread broadens D, but does not change physical surface masking.
  const maskingView = smithRatio(nv, dot(v, t), dot(v, b), sx, sy);
  const maskingLight = nl * smithRatio(nl, dot(l, t), dot(l, b), sx, sy);
  return distribution * fresnel * maskingView * maskingLight * 0.25;
}

/** The flat-water mirror point may correctly fall outside the visible river. */
export function flatWaterReflection(direction: Vector, aspect: number) {
  if (direction[2] <= 1e-6 || aspect <= 0) return null;
  return {
    x: 0.5 + direction[0] / (direction[2] * aspect),
    y: WATER_HORIZON - direction[1] / direction[2],
  };
}

/** Same equations as waterSpecular, kept free of scene uniforms for reuse. */
export const waterLightingGLSL = `
float waterSmithRatio(float cosine,float tangent,float bitangent,float sx,float sy){
 float projected=sqrt(2.*(sx*sx*tangent*tangent+sy*sy*bitangent*bitangent));
 if(projected<1.e-8)return 1./max(cosine,1.e-8);
 float a=cosine/projected;
 if(a>=1.6)return 1./max(cosine,1.e-8);
 return (3.535+2.181*a)/(projected*(1.+2.276*a+2.577*a*a));
}
float waterSourceCov(vec2 a,vec2 b,vec3 c){
 return c.x*a.x*b.x+c.y*(a.x*b.y+a.y*b.x)+c.z*a.y*b.y;
}
float moonSpecular(vec3 view,vec3 normal,vec3 direction,vec3 tangentX,vec3 tangentY,vec3 covariance,vec2 wind,float energy){
 vec3 v=normalize(view),n=normalize(normal),l=normalize(direction);
 float nv=dot(n,v),nl=dot(n,l);
 if(nv<=1.e-6||nl<=1.e-6)return 0.;
 vec3 axis=length(wind)>1.e-6?vec3(wind.x,0.,wind.y):vec3(1.,0.,0.);
 vec3 t=axis-n*dot(axis,n);
 if(dot(t,t)<1.e-8)t=cross(n,abs(n.y)<.9?vec3(0.,1.,0.):vec3(0.,0.,1.));
 t=normalize(t);
 vec3 b=cross(n,t),rawHalf=v+l;
 float halfLength=length(rawHalf);
 if(halfLength<1.e-6)return 0.;
 float hn=max(dot(rawHalf,n),1.e-6);
 vec2 slope=vec2(dot(rawHalf,t),dot(rawHalf,b))/hn;
 vec2 jx=(vec2(dot(tangentX,t),dot(tangentX,b))-slope*dot(tangentX,n))/hn;
 vec2 jy=(vec2(dot(tangentY,t),dot(tangentY,b))-slope*dot(tangentY,n))/hn;
 vec3 c=vec3(max(covariance.x,0.),covariance.y,max(covariance.z,0.));
 float cxyLimit=sqrt(c.x*c.z);
 c.y=clamp(c.y,-cxyLimit,cxyLimit);
 float sx=.045+.014*sqrt(max(energy,0.)),sy=sx*.78;
 vec2 rowX=vec2(jx.x,jy.x),rowY=vec2(jx.y,jy.y);
 float sourceXX=waterSourceCov(rowX,rowX,c),sourceYY=waterSourceCov(rowY,rowY,c);
 float xx=sx*sx+sourceXX;
 float xy=waterSourceCov(rowX,rowY,c);
 float sourceDeterminant=max(c.x*c.z-c.y*c.y,0.);
 float jacobianDeterminant=dot(cross(tangentX,tangentY),rawHalf)/(hn*hn*hn);
 float determinant=max(sx*sx*sy*sy+sx*sx*sourceYY+sy*sy*sourceXX+
  sourceDeterminant*jacobianDeterminant*jacobianDeterminant,1.e-12);
 float residual=slope.y-xy/xx*slope.x;
 float exponent=slope.x*slope.x/xx+residual*residual*xx/determinant;
 float slopeDensity=exp(-.5*exponent)/(6.28318530718*sqrt(determinant));
 float nh=max(hn/halfLength,1.e-6);
 float distribution=slopeDensity/(nh*nh*nh*nh);
 float vh=clamp(dot(v,rawHalf)/halfLength,0.,1.);
 float fresnel=.02037+.97963*pow(1.-vh,5.);
 float maskingView=waterSmithRatio(nv,dot(v,t),dot(v,b),sx,sy);
 float maskingLight=nl*waterSmithRatio(nl,dot(l,t),dot(l,b),sx,sy);
 return distribution*fresnel*maskingView*maskingLight*.25;
}
`;
