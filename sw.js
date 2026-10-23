const CACHE = 'whisper-pixels-v13';
const ASSETS = ['./', './index.html', './studio.html', './inspector.html', './manifest.webmanifest', './icon.svg', './css/studio.css', './css/theme-accessibility.css', './css/landing.css', './css/inspector.css', './js/landing.js', './js/studio.js', './js/inspector.js', './js/explainer.js', './js/crypto.js', './js/zerowidth.js', './js/image-worker.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
