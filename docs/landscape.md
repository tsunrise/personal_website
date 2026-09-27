# Landscape editing guide

The background is an original, procedural blue-dusk Suzhou landscape: moon at upper right, misty mountains, river, stone arch bridge with an abstract bank, willow at left, and reeds in the shallows. Keep the center open for the small serif title, links, and questions. Movement should remain quiet and secondary to reading.

## Where to edit

| File | Responsibility |
| --- | --- |
| `src/components/landscape/painting.ts` | Seeded Canvas 2D artwork, layer depths, portrait composition, wind masks, static fallback. |
| `src/components/landscape/Landscape.tsx` | Three.js planes, shaders, parallax, animation clock, resize, fallback switching, disposal. |
| `src/components/landscape/geese.ts` | Occasional flocks, flight scheduling, wing geometry, and bird resource cleanup. |
| `src/App.tsx` | Manual motion control and the lazily loaded, memoized scene component. |
| `src/index.css` | Fixed canvas positioning and interaction dimming. No persistent center overlay; dim only for prompt focus, populated input, or an answer (clearing a focused input stays dim until focus leaves). |

## Rendering model

`paintLandscape(w, h)` returns ordered `Painting` objects: a canvas, a parallax `depth`, a `kind`, and an optional `windMap`. The drawing uses `seeded(41)`; changing the seed or random-call order changes subsequent details. Artwork is generated on initialization and resize, not on each frame or chat update.

Three.js uses an orthographic camera and transparent full-screen planes. Their 1.055 overscan hides edges during movement. Depth testing is disabled: `renderOrder`, not physical Z, controls overlap. Painting order is moon, mountains, river, bridge, banks, reed shallows, reeds, willow wood, then foliage. The shader sky is order 0, geese 1.5, and mist 5.5 (between the river and bridge). Recheck these explicit orders if adding or moving layers.

`kind` selects shader behavior:

- `paint` → 0: static texture plus grain.
- `water` → 1: moving reflections, ripples, and glints.
- `willow` → 2 and `reeds` → 3: wind displacement weighted by the wind map's red channel; black pins a point, white allows full movement.

Canvas coordinates run downward from the top; shader UV Y runs upward. The river horizon is `h * 0.705`, paired with the shader's `0.295` water region. Update both if moving the horizon. Portrait composition switches at `w / h < 0.85`; positions are recomputed, not merely cropped.

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

The scene tests cover pause behavior, touch parallax and listener cleanup, wind-map disposal, initialization failure, and context loss/resize; geese tests cover scheduling, wings, and cleanup. They do not judge visual quality. Inspect desktop and narrow portrait screens, resize and pointer extremes, focused/answered chat contrast, manual pause/resume, and the Canvas 2D fallback. Restore browser emulation and any forced context loss after checking.
