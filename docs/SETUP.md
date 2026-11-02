# Setup, testing and deployment

No backend, no environment variables, no secrets, no dependencies.

## Run locally
```bash
npm start            # http://localhost:5173 (Node ≥ 18, no build step)
```

## Tests
```bash
npm test             # unit + integration (node:test)
npm start & npm run test:ui   # phone-sized browser test, light + dark (needs Playwright; skipped if missing)
npm run test:all
node scripts/gen-dictionary.mjs   # regenerate docs/DATA_DICTIONARY.md after schema changes
```

## Deploy (GitHub Pages, static files only)
Settings → Pages → Deploy from a branch → choose the branch → `/ (root)`. Live: https://obopd.github.io/Sleep-Advise-App/. After changing any file the app loads, bump `CACHE` in `sw.js` and keep its `SHELL` list in sync.
