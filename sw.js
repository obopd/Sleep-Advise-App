// Offline support: network-first (so updates arrive immediately), falling back to the
// cached copy when offline. Only same-origin GET requests are handled.
const CACHE = 'sleep-advisor-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'fonts/fraunces-latin-wght-normal.woff2',
  'src/ui/app.js', 'src/ui/config.js', 'src/ui/dialogs.js', 'src/ui/dom.js', 'src/ui/forms.js', 'src/ui/kit.js', 'src/ui/nav.js',
  'src/ui/sample.js', 'src/ui/storage.js', 'src/ui/store.js', 'src/ui/styles.css', 'src/ui/theme.js', 'src/ui/why.js',
  'src/ui/screens/biology.js', 'src/ui/screens/insights.js', 'src/ui/screens/labform.js', 'src/ui/screens/log.js', 'src/ui/screens/more.js',
  'src/ui/screens/onboarding.js', 'src/ui/screens/plan.js', 'src/ui/screens/research.js', 'src/ui/screens/today.js',
  'src/core/chronotype.js', 'src/core/clock.js', 'src/core/cloud.js', 'src/core/features.js', 'src/core/forger99.js', 'src/core/format.js',
  'src/core/importers.js', 'src/core/insights.js', 'src/core/predict.js', 'src/core/quality.js', 'src/core/recommend.js', 'src/core/references.js',
  'src/core/repo.js', 'src/core/research.js', 'src/core/schema.js', 'src/core/scheduler.js', 'src/core/sleep.js', 'src/core/sleepNeed.js',
  'src/core/time.js', 'src/core/validate.js', 'src/core/zip.js', 'src/core/models/circadian.js', 'src/core/models/sleepPressure.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
