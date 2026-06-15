// Service worker: cache "app shell" (ikon/manifest/halaman) agar app cepat dibuka & bisa
// diluncurkan offline. Konten dashboard (iframe Apps Script) selalu via jaringan.
var CACHE = 'kh-shell-v1';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Hanya tangani aset shell (same-origin). Permintaan ke Apps Script (cross-origin) dibiarkan ke jaringan.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
  }
});
