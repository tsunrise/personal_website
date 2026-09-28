# Project guide

React 18, TypeScript, and Create React App. See [README.md](README.md) for install, development, build, and test commands.

## Structure

- `src/App.tsx`: page composition, inline answers, dialogs, and manual motion control.
- `src/index.css`: typography, responsive layout, and background dimming for focus, populated prompts, or answers; clearing a focused prompt stays dim.
- `src/components/salieri/Composer.tsx`: editable prompt and Turnstile lifecycle. Focusing the input does not fetch or display candidate questions.
- `src/components/salieri/service.ts`: remote API, streaming, cancellation, and chat state.
- `src/components/landscape/`: procedural artwork, Three.js shaders, and shared breeze physics in `wind.ts`; `bridgeGeometry.ts` shares the water camera with the painted bridge in `bridge.ts` and shoreline washes in `banks.ts`. Read [docs/landscape.md](docs/landscape.md) before changing the scene, including water/moon coordinates, mobile proportions, and passive touch parallax. All environmental motion uses the same pause-aware wind clock.
- `src/components/Dialog.tsx`, `privacy.tsx`: accessible dialogs; `src/images/qr-code.svg`: WeChat QR code.
- `public/`: page metadata, icons, privacy policy, verification files, and public keys.
- Tests live beside components; `src/setupTests.ts` configures the test environment.

## Implementation rules

- Update this `AGENTS.md` alongside implementation changes when structure, behavior, commands, or constraints change. Keep it concise and accurate; update `docs/landscape.md` for landscape changes.
- Tune plant movement through flexibility and spring damping; softer stems should have longer natural periods. Keep attachment masks pinned and wide enough for the leaves' full sway. Keep the willow's steady lean small while retaining gust variation. Plant masks pack flexibility/depth/attachment distance in RGB; project world X/Z bending through the water's shared perspective, including depth wind.
- Wind seed and prevailing direction are randomized once per page load; preserve them across pause, resize, and remounts. Align the fixed water-wave basis with that night's initial breeze.
- Bridge geometry uses a common circular arch with radial joints and uniform world proportions. Keep abutments connected to banks, reflect across the water plane, and retain depth 4 for all three layers. Use broad mineral washes and sparse stone marks to match the mountains; avoid masonry grids and regular rock edging. Bridge/bank material seeds are independent of the established plant sequence.
- Portrait placement retains 62.5% of the baseline bank approach height through a smaller, nearer world model at the same apparent bridge size. Banks use a wider foot and shorter diagonal washes. Mobile reeds follow the inlet and shallows beneath the arch; mask their reflections off dry banks. Preserve desktop placement and plant counts.
- Low mountain contours dissolve with their faces into the horizon mist. Reflections mirror below the water horizon as faint dark washes; copying pale land colors makes the gaps read as upright submerged mountains.
- Prefer using built-in browser (if available) instead of Playwright for testing. If using playwright, remove temporary playwright artifact in the end.
- API base: `REACT_APP_SALIERI_API_ENDPOINT`, default `https://tomshen.io/api/salieri`. No hint requests; send `{ question, captcha_token }` over WebSocket `/chat`. Successful wire completion is `{ finish: "stop" }`; also accept the legacy `"finish"` alias.
