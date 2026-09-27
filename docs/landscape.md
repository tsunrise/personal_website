# Landscape editing guide

The background is an original, procedural blue-dusk Suzhou landscape: moon at upper right, misty mountains, river, stone arch bridge with an abstract bank, willow at left, and reeds in the shallows. Keep the center open for the small serif title, links, and questions. Movement should remain quiet and secondary to reading.

## Where to edit

| File | Responsibility |
| --- | --- |
| `src/components/landscape/painting.ts` | Seeded Canvas 2D artwork, layer depths, portrait composition, wind masks, static fallback. |
| `src/components/landscape/Landscape.tsx` | Three.js planes, shared weather uniforms, parallax, animation clock, resize, fallback switching, disposal. |
| `src/components/landscape/wind.ts` | Seeded, correlated wind velocity, integrated advection, plant springs, and delayed water response. |
| `src/components/landscape/plantMotion.ts` | Linear RGB plant metadata and camera depth at reed roots. |
| `src/components/landscape/shaders.ts` | Wind-driven clouds/mist/foliage, directional wave spectrum, and moon reflection shading. |
| `src/components/landscape/composition.ts` | Shared river horizon, eye height, and portrait/landscape moon position and radius. |
| `src/components/landscape/geese.ts` | Occasional flocks, flight scheduling, wing geometry, and bird resource cleanup. |
| `src/App.tsx` | Manual motion control and the lazily loaded, memoized scene component. |
| `src/index.css` | Fixed canvas positioning and interaction dimming. No persistent center overlay; dim only for prompt focus, populated input, or an answer (clearing a focused input stays dim until focus leaves). |

## Rendering model

`paintLandscape(w, h)` returns ordered `Painting` objects: a canvas, a parallax `depth`, a `kind`, and optional `windMap` and `fallback` canvases. The river's fallback canvas contains static ripple/moon highlights; its WebGL canvas omits them so highlights come entirely from moving surface normals. The drawing uses `seeded(41)`; changing the seed or random-call order changes subsequent details. Artwork is generated on initialization and resize, not on each frame or chat update.

Three.js uses an orthographic camera and transparent full-screen planes. Their 1.055 overscan hides edges during movement. Depth testing is disabled: `renderOrder`, not physical Z, controls overlap. Painting order is moon, mountains, river, bridge, banks, reed shallows, reeds, willow wood, then foliage. The shader sky is order 0, geese 1.5, and mist 5.5 (between the river and bridge). Recheck these explicit orders if adding or moving layers.

`kind` selects shader behavior:

- `paint` → 0: static texture plus grain.
- `water` → 1: moving reflections, ripples, and glints.
- `willow` → 2 and `reeds` → 3: world-space bending followed by perspective projection. Wind maps store flexibility in R (0 pins a point, 1 allows full movement), camera depth / 16 m in G, and vertical rest distance from the attachment / 3 m in B. Keep these textures in `NoColorSpace`.
- `shallows` → 4: reed-bed reflections use the river's wave distortion without adding a second layer of sky/moon lighting.

Canvas coordinates run downward from the top; shader UV Y runs upward. `WATER_HORIZON = 0.295` in `composition.ts` supplies both the Canvas horizon (`h * 0.705`) and water shader. Plants and water share a virtual camera with `EYE_HEIGHT = 1.4` m and principal UV `(0.5, WATER_HORIZON)`. `moonPosition()` supplies the painted moon and shader light direction/radius. Portrait composition switches at `w / h < 0.85`; positions are recomputed, not merely cropped.

## Wind and water

The wind is a lightweight procedural approximation of sheltered summer weather, not a fluid solver. World +X is screen-right and +Z is across the river away from the viewer. `wind.ts` draws a fresh 32-bit weather seed and a prevailing direction over the full circle once per page load. The profile lives in module memory, independently of the artwork seed, so React remounts/Strict Mode, pause, and resize do not choose another night; nothing is saved to browser storage. Pass an explicit `BreezeProfile` to `sampleBreeze()` for reproducible checks. Quintic seeded noise combines slow weather (19 s), gusts (5.7 s), and small fluctuations (1.9 s); direction veers more slowly (37/11 s), within ±0.62 radians of that night's prevailing direction. The bounded speed is 0.42–2.08 m/s, around light air/light breeze. See the [NWS Beaufort scale](https://www.weather.gov/mfl/beaufort) for the calm ripple/wavelet reference.

One persistent `createWind()` instance advances at fixed 1/120 s steps within the existing render clock. It survives resize, freezes with manual pause or hidden tabs, and never catches up on wall-clock time. Clouds and mist use the integral of the same velocity (at different projection scales); subtract this displacement in texture lookups so they travel downwind. Do not substitute `currentSpeed * time`, which jumps when the speed changes.

Willow and reed bending is driven by quadratic drag (`velocity * speed`), with separate damped springs; reeds respond faster. Willow/reed damping ratios of 0.50/0.58 allow gentle recoil after gusts, with world-space flexibility gains of 0.027/0.024 m per unit drag. The willow's spatial loading is centered on 0.60 (reeds: 1.00), keeping its hanging foliage closer to vertical even in the initial breeze. Both retain ±0.26 spatial load variation and smaller wind-aligned leaf flutter to break up synchronized movement. Increase responsiveness through these plant parameters rather than increasing the shared weather's speed. Flexibility masks pin roots/attachments; the willow's 64-pixel mask strokes cover the swept leaves so larger bends do not clip at the resting silhouette. Wood stays still.

The wind vector has two horizontal world components (X/Z), with no vertical gust. Plant points reconstruct their resting camera-space position from UV and mask depth, bend in world X/Z, then project using the new depth. Wind away from the viewer shrinks the foliage toward the horizon's vanishing point; wind toward the viewer enlarges it. This also makes the same sideways displacement subtler on farther reeds. Reed depth is inferred from each clump's waterline root; the foreground willow uses a shallow 4.6–5.56 m canopy depth gradient in its uncropped local coordinates. A root-to-point reach constraint gives upright reeds a small downward bend and hanging willow tips a small upward arc, capped at 28% lateral deflection. Two inverse-lookup iterations sample the deformed artwork without moving its pinned roots. This is a lightweight perspective deformation of painted layers, not a full plant mesh: overlap order stays fixed and individual leaves do not turn to expose a back face. It adds no textures or per-frame CPU work. See [Khronos on perspective division](https://wikis.khronos.org/opengl/Perspective_Divide).

Water velocity and energy relax toward the wind over 7 s, retaining motion through a lull; surface drift is 1.5% of this filtered wind.

The river uses six fixed directional gravity/capillary waves, with `omega² = (9.81*k + 0.000074*k³) * tanh(k*1.8)` and millimetre-scale amplitudes. `uWaveBasis` orients the spectrum to the initial breeze, allowing nights with wind from any direction. This basis stays fixed for the scene's lifetime, including resize: subsequent wind alignment controls energy, not wavevector rotation, so veering does not swivel existing ripples. A perspective ray/plane intersection compresses distant waves, and pixel-footprint filtering suppresses unresolved ripples. Analytic slopes distort the painted mountain reflections and provide normals for Fresnel sky reflection and a softened moon specular lobe. Moonlight depends on the moon/view half-vector and wave normals, rather than a moving strip of random white lines. The finite moon radius and unresolved surface roughness soften glints; keep the near-water highlight quiet. This follows the small spectral-surface approach in [GPU Gems, Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).

## Details to preserve

- **Willow:** the tree uses a local width of `max(w, h * 1.15)` and shifts left by 26% of the excess width. Narrow screens crop the canopy instead of squeezing it; wood, foliage, and wind masks share this translation. Do not reintroduce X-only scaling. `grow()` samples parent branches so joints remain connected. The woody skeleton is static; foliage is a separate layer. Leaf positions follow their hanging stem curves, and wind masks pin attachments even where masks overlap.
- **Reeds:** keep roots in shallow water, not on dry banks. Submerged stems fade into soft bed shadows and broken reflections. Root masks stay dark so tips sway without the whole clump sliding across the water.
- **Bridge:** keep the footing connected to its softly textured bank. Both use depth 4 so parallax cannot separate them. The approach is deliberately abstract, with no paved path.
- **River:** preserve the alpha fade into distant mist; a hard texture edge previously produced a horizontal seam.
- **Parallax:** depth is approximately maximum displacement in CSS pixels. Current values run from 2 for the moon to 5 for the willow. Keep tree and bridge motion subtle; text stays stationary.
- **Geese:** 2–6 birds per flock, with individual wingbeats and brief glides. First arrival is after 12–24 animation seconds; flights last 18–28 seconds, followed by 55–120 quiet seconds. The schedule survives resize and uses the shared animation clock rather than wall-clock timers.

## Performance and fallback

Rendering is capped at 30 fps and device pixel ratio 1.5. Painting resolution scales by `min(1.5, 1600 / width, 1400 / height)`; resize is debounced by 160 ms. Mouse parallax requires a fine pointer. Single-finger touchstart/touchmove use the same clamped viewport coordinates through passive listeners, so Safari native scrolling can continue after pointer cancellation. Touch release, cancellation, or multiple fingers return the target to center; never disable scrolling or pinch zoom to enable parallax. Pause state lives only in React memory and is never read from or written to browser storage. Each page load starts unpaused. System reduced-motion preferences are not consulted; the page toggle alone freezes animation. As a separate performance measure, hidden tabs do not advance the clock or render.

WebGL initialization failure or context loss switches to `drawFallback()`, which composites the same artwork over a static sky. It has no shader movement or geese and remains active until remount/reload. Inspect `.landscape[data-renderer]` (`webgl` or `canvas2d`) when debugging.

Register new textures/materials for disposal, including wind maps. Dispose bird geometry, cancel animation frames and resize timers, disconnect observers, and remove listeners on teardown. Resizing rebuilds textures but must not restart the flock schedule or leak GPU resources.

## Verification

```sh
CI=true npm test -- --watchAll=false --runInBand src/components/landscape
npm run build
```

The scene tests cover shared wind state and fixed wave orientation across pause/hidden tabs/resize, touch parallax and listener cleanup, wind-map disposal, initialization failure, and context loss/resize. Wind tests cover one profile per page, reproducibility, distinct seeds, bounds/continuity across compass headings, opposite-wind responses, frame-rate independence, drag/spring response, and wave-energy decay; plant metadata tests check root-depth reprojection and RGB packing precision; geese tests cover scheduling, wings, and cleanup. They do not compile GLSL or judge visual quality. Inspect browser console for shader errors, desktop and narrow portrait screens, resize and pointer extremes, focused/answered chat contrast, manual pause/resume, and the Canvas 2D fallback. When changing plant projection, check pure ±X and ±Z wind: roots stay fixed, sideways bends reverse, and depth wind contracts/expands foliage with smaller motion at greater distance. Restore browser emulation and any forced context loss after checking.
