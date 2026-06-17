// Service worker: cache "app shell" (ikon/manifest/halaman) agar app cepat dibuka & bisa
// diluncurkan offline. Konten dashboard (iframe Apps Script) selalu via jaringan.
var CACHE = 'kh-shell-v4';
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
  var req = e.request;
  var url = new URL(req.url);
  // Cross-origin (iframe Apps Script) dibiarkan ke jaringan.
  if (url.origin !== self.location.origin) return;
  // Halaman (navigasi): utamakan jaringan agar shell selalu versi terbaru; fallback cache saat offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return r;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }
  // Aset lain (ikon/manifest): cache dulu.
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
