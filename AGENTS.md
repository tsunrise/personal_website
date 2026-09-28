# Project guide

React 18, TypeScript, and Create React App. See [README.md](README.md) for install, development, build, and test commands.

## Structure

- `src/App.tsx`: page composition, inline answers, and dialogs.
- `src/index.css`: typography, responsive layout, moon interaction target, and background dimming for focus, populated prompts, or answers; clearing a focused prompt stays dim.
- `src/components/salieri/Composer.tsx`: editable prompt and Turnstile lifecycle. Focusing the input does not fetch or display candidate questions.
- `src/components/salieri/service.ts`: remote API, streaming, cancellation, and chat state.
- `src/components/landscape/`: procedural artwork, draggable moon and shared lighting, Three.js shaders, and shared breeze physics in `wind.ts`; `bridgeGeometry.ts` shares the water camera with the painted bridge in `bridge.ts` and shoreline washes in `banks.ts`. Read [docs/landscape.md](docs/landscape.md) before changing the scene, including water/moon coordinates, mobile proportions, and touch interaction. The moon starts at its default position on each page load; movement is not persisted. The animation clock freezes while the page is hidden; there is no manual pause control.
- `src/components/Dialog.tsx`, `privacy.tsx`: accessible dialogs; `src/images/qr-code.svg`: WeChat QR code.
- `public/`: page metadata, icons, privacy policy, verification files, and public keys.
- Tests live beside components; `src/setupTests.ts` configures the test environment.

## Implementation rules

- Update this `AGENTS.md` alongside implementation changes when structure, behavior, commands, or constraints change. Keep it concise and accurate; update `docs/landscape.md` for landscape changes.
- Prefer using built-in browser (if available) instead of Playwright for testing. If using playwright, remove temporary playwright artifact in the end.
- API base: `REACT_APP_SALIERI_API_ENDPOINT`, default `https://tomshen.io/api/salieri`. No hint requests; send `{ question, captcha_token }` over WebSocket `/chat`. Successful wire completion is `{ finish: "stop" }`; also accept the legacy `"finish"` alias.
