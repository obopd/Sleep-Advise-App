# Setup, testing and deployment

## Run locally
```bash
npm start            # http://localhost:5173 (no dependencies to install)
```
Node ≥ 18. No build step.

## Tests
```bash
npm test             # unit + integration (node:test)
npm run test:db      # migration + Row Level Security on local Postgres (needs Postgres; the cloud dev box has 16)
npm start & npm run test:ui   # phone-sized browser test, light + dark (needs Playwright; skipped if missing)
npm run test:all     # all three
node scripts/gen-dictionary.mjs   # regenerate docs/DATA_DICTIONARY.md after schema changes
```

## Deploy (GitHub Pages)
The repository root is the site. Settings → Pages → Deploy from a branch → choose the branch → `/ (root)`. Live: https://obopd.github.io/Sleep-Advise-App/. After changing any file the app loads, bump `CACHE` in `sw.js` and keep its `SHELL` list in sync.

## Optional: accounts and cloud sync (Supabase)
Environment / configuration (all public values; there are **no secrets** in this app):

| Setting | Where | Value |
|---|---|---|
| `SUPABASE_URL` | `src/ui/config.js` | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | `src/ui/config.js` | the project's public anon / publishable key |

Steps:
1. Create a Supabase project (free tier is enough to start).
2. SQL Editor → paste `supabase/migrations/0001_init.sql` → Run (safe to re-run).
3. Authentication → Providers → Email: enable; set the Site URL to the Pages URL.
4. Put the URL and anon key in `src/ui/config.js`, commit, push.
5. To approve a researcher: `insert into public.app_researchers (user_id) values ('<auth user id>');` in the SQL editor.

Never put the service-role key in the repository or the browser.
