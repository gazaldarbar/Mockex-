/* Offline app shell. Market-data requests are never cached here. */
const V = 'mockex-v2';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/engine.js', 'js/indicators.js', 'js/feed.js', 'js/store.js', 'js/market.js', 'js/chart.js', 'js/rewards.js', 'js/app.js', 'js/ui.js', 'js/ui2.js', 'js/ui3.js', 'js/boot.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/favicon.png', 'brand/mark.png', 'brand/wordmark.png', 'brand/wordmark-dark.png', 'brand/app-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./')))); });
