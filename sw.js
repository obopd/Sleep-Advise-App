// Offline support: network-first (so updates arrive immediately), falling back to the
// cached copy when offline. Only same-origin GET requests are handled.
const CACHE = 'sleep-advisor-v7';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'fonts/fraunces-latin-wght-normal.woff2',
  'src/ui/app.js', 'src/ui/chart.js', 'src/ui/storage.js', 'src/ui/sample.js', 'src/ui/styles.css',
  'src/ui/dom.js', 'src/ui/dialogs.js', 'src/ui/store.js', 'src/ui/theme.js', 'src/ui/why.js', 'src/ui/logsheet.js',
  'src/ui/tonight.js', 'src/ui/week.js', 'src/ui/settings.js', 'src/ui/onboarding.js',
  'src/engine/index.js', 'src/engine/time.js', 'src/engine/sleepMetrics.js', 'src/engine/chronotype.js',
  'src/engine/circadian.js', 'src/engine/sleepNeed.js', 'src/engine/habits.js', 'src/engine/safety.js',
  'src/engine/recommend.js', 'src/engine/references.js', 'src/engine/forger99.js', 'src/engine/lightModel.js',
  'src/engine/importers.js',
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
