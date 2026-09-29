# Project guide

React 18, TypeScript, and Create React App. See [README.md](README.md) for install, development, build, and test commands.

## Structure

- `src/App.tsx`: page composition, inline answers, dialogs, and the bottom-left 月読 toggle. Tsukuyomi mode starts off on every page load and hides page content while preserving the interactive landscape, draft, and answer. There is no skip-to-content link.
- `src/index.css`: typography, responsive layout, moon interaction target, Tsukuyomi toggle styling, and background dimming for focus, populated prompts, or answers; clearing a focused prompt stays dim. Tsukuyomi mode removes that dimming.
- `src/components/salieri/Composer.tsx`: editable prompt and Turnstile lifecycle. Focusing the input does not fetch or display candidate questions.
- `src/components/salieri/service.ts`: remote API, streaming, cancellation, and chat state.
- `src/components/landscape/`: procedural artwork, draggable moon and shared lighting, Three.js shaders, and shared breeze physics in `wind.ts`; `bridgeGeometry.ts` shares the water camera with the painted bridge in `bridge.ts` and shoreline washes in `banks.ts`. Read [docs/landscape.md](docs/landscape.md) before changing the scene, including water/moon coordinates, mobile proportions, and touch interaction. The moon starts at its default position on each page load; movement is not persisted. Rendering targets 60 fps. The animation clock freezes while the page is hidden; there is no manual pause control.
- Landscape light uses `lighting.ts` for distant moon direction, atmospheric extinction/airlight, joint cloud/mountain transmission, source moments, and bounded dusk ambient. `clouds.ts`/`cloudShaders.ts` share a deterministic two-layer optical-depth field; `waterLighting.ts` shares normalized water reflection equations between WebGL and Canvas. Clouds cover the moon once, and transmitted lighting updates as clouds move even when the moon is still. Preserve visible pearl clouds at startup and soften an attenuated moon into local sky radiance instead of black. Preserve clear-sky reference brightness, linear-light shading, and the static fallback's frozen weather; cloud overlap does not affect the mountain-only moon reset threshold.
- `src/components/Dialog.tsx`: accessible WeChat dialog; `src/images/qr-code.svg`: WeChat QR code.
- `public/`: page metadata, moon-and-mountains favicons and home-screen icons, verification files, and public keys. Icon source: `src/images/moon-favicon.png`; generation prompt and export sizes: [docs/favicon.md](docs/favicon.md).
- Tests live beside components; `src/setupTests.ts` configures the test environment.

## Implementation rules

- Update this `AGENTS.md` alongside implementation changes when structure, behavior, commands, or constraints change. Keep it concise and accurate; update `docs/landscape.md` for landscape changes.
- Prefer using built-in browser (if available) instead of Playwright for testing. If using playwright, remove temporary playwright artifact in the end.
- API base: `REACT_APP_SALIERI_API_ENDPOINT`, default `https://tomshen.io/api/salieri`. No hint requests; send `{ question, captcha_token }` over WebSocket `/chat`. Successful wire completion is `{ finish: "stop" }`; also accept the legacy `"finish"` alias.
