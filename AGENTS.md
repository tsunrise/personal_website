# Project guide

React 18, TypeScript, and Create React App. See [README.md](README.md) for install, development, build, and test commands.

## Structure

- `src/App.tsx`: page composition, inline answers, dialogs, and manual motion control.
- `src/index.css`: typography, responsive layout, and background dimming for focus, populated prompts, or answers; clearing a focused prompt stays dim.
- `src/components/salieri/Composer.tsx`: editable prompt and Turnstile lifecycle. Focusing the input does not fetch or display candidate questions.
- `src/components/salieri/service.ts`: remote API, streaming, cancellation, and chat state.
- `src/components/landscape/`: procedural artwork, Three.js shaders, and shared breeze physics in `wind.ts`. Read [docs/landscape.md](docs/landscape.md) before changing the scene, including water/moon coordinates, mobile willow proportions, and passive touch parallax. All environmental motion uses the same pause-aware wind clock.
- `src/components/Dialog.tsx`, `privacy.tsx`: accessible dialogs; `src/images/qr-code.svg`: WeChat QR code.
- `public/`: page metadata, icons, privacy policy, verification files, and public keys.
- Tests live beside components; `src/setupTests.ts` configures the test environment.

## Implementation rules

- Update this `AGENTS.md` alongside implementation changes when structure, behavior, commands, or constraints change. Keep it concise and accurate; update `docs/landscape.md` for landscape changes.
- Tune plant movement through flexibility and spring damping; keep attachment masks pinned and wide enough for the leaves' full sway. Keep the willow's steady lean small while retaining gust variation. Plant masks pack flexibility/depth/attachment distance in RGB; project world X/Z bending through the water's shared perspective, including depth wind.
- Wind seed and prevailing direction are randomized once per page load; preserve them across pause, resize, and remounts. Align the fixed water-wave basis with that night's initial breeze.
- API base: `REACT_APP_SALIERI_API_ENDPOINT`, default `https://tomshen.io/api/salieri`. No hint requests; send `{ question, captcha_token }` over WebSocket `/chat`. Successful wire completion is `{ finish: "stop" }`; also accept the legacy `"finish"` alias.
