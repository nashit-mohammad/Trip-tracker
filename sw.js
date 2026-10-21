// Trip Tracker service worker: lets the app open offline and keeps map tiles you have already seen.
// The app itself always tries the network first, so new versions show up when you are online.
const SHELL = 'tt-shell-v1';
const TILES = 'tt-tiles-v1';
const MAX_TILES = 400;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.all(ASSETS.map((u) =>
        c.add(new Request(u, { mode: u.startsWith('http') ? 'no-cors' : 'same-origin' })).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: network first, fall back to the saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Map tiles: use the saved tile if we have it, otherwise fetch and keep it.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(TILES).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        c.put(req, res.clone()).then(trimTiles);
        return res;
      }).catch(() => hit)))
    );
    return;
  }

  // App files and the map library: saved copy first.
  if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
