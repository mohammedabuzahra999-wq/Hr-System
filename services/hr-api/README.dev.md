## Why `--conditions=development`

`@hr/shared` publishes two entry points: the TypeScript source, and a compiled
`dist/` that plain Node can load in production. Which one a tool picks is
decided by export conditions, and **tsx does not set `development` on its own** —
without the flag it silently loads `dist/`, so an edit to `packages/contracts/src` has no
effect until somebody remembers to rebuild.

That is a bad failure: nothing errors, the change simply does not happen, and
the time goes into debugging the wrong file. The flag pins dev to the source.

Production is the other way round and needs no flag: `npm start` runs plain
Node, which takes the `default` condition and loads the built JavaScript.

## Relocated package and retained runtime

The Node package is `services/hr-api` (`@hr/server`). Runtime commands preload
`scripts/runtimePreload.mjs` to retain `server/.env` and relative uploads under
`server/`. Do not invoke the preload during offline validation. The Python worker
remains in `server/local-voice`; models and its token remain in `.local-voice`.
Production entry: `dist/services/hr-api/src/index.js`.
