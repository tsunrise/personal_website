# Tom Shen

My personal website: [tomshen.io](https://tomshen.io).

Requires Node.js 18+ and npm 8+.

```sh
npm ci --legacy-peer-deps                # Install dependencies
npm start                               # Local development at localhost:3000
npm run build                           # Production build in build/
CI=true npm test -- --watchAll=false --runInBand
```
