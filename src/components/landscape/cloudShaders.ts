/** Counterpart of clouds.ts; all radiance is linear and all metadata stays linear. */
export const cloudGLSL = `
uniform sampler2D uCloudMap;
uniform vec2 uMoonSky;

vec3 cloudLinear(vec3 color){
 return mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
}
float cloudLayerDepth(vec2 uv,bool farLayer){
 vec2 p=(vec2(uv.x*uAspect,uv.y)-uAirOffset*vec2(.0015,.0003))*.25;
 p+=farLayer?vec2(.52,.1225):vec2(.495,.14);
 vec4 cloudSample=texture2D(uCloudMap,p);
 return (farLayer?cloudSample.g:cloudSample.r)*2.*smoothstep(.15,.5,uv.y);
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
