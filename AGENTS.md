# Project guide

React 18, TypeScript, and Create React App. See [README.md](README.md) for install, development, build, and test commands.

## Structure

- `src/App.tsx`: page composition, inline answers, dialogs, and manual motion control.
- `src/index.css`: typography, responsive layout, and background dimming.
- `src/components/salieri/Composer.tsx`: editable prompt and Turnstile lifecycle.
- `src/components/salieri/service.ts`: remote API, streaming, cancellation, and chat state.
- `src/components/landscape/`: procedural artwork and Three.js rendering. Read [docs/landscape.md](docs/landscape.md) before changing the scene.
- `src/components/Dialog.tsx`, `privacy.tsx`: accessible dialogs; `src/images/qr-code.svg`: WeChat QR code.
- `public/`: page metadata, icons, privacy policy, verification files, and public keys.
- Tests live beside components; `src/setupTests.ts` configures the test environment.

## Implementation rules

- Update this `AGENTS.md` alongside implementation changes when structure, behavior, commands, or constraints change. Keep it concise and accurate; update `docs/landscape.md` for landscape changes.
- API base: `REACT_APP_SALIERI_API_ENDPOINT`, default `https://tomshen.io/api/salieri`. Fetch `GET /hint`; send `{ question, captcha_token }` over WebSocket `/chat`. Successful wire completion is `{ finish: "stop" }`; also accept the legacy `"finish"` alias.