/* AYLA GYNO Student: cache only this edition's local application shell. */
const CACHE_NAME = "ayla-gyno-student-v1.0.1";
const CACHE_PREFIX = "ayla-gyno-student-";
const STATIC_CACHE = [
  "./",
  "./index.html",
  "./about.html",
  "./privacy.html",
  "./app.js",
  "./ui-icons.js",
  "./ui-icons.css",
  "./ayla-theme.css",
  "./taxonomy.js",
  "./search-engine.js",
  "./classification-guide.js",
  "./jszip_min.js",
  "./update-package.js",
  "./manifest.json",
  "./ayla-icon.svg",
  "./ayla-mark.png",
  "./ayla-logo.png",
  "./ayla-logo-dark.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];
const ROOT = new URL('./', self.location.href);
const ALLOWED = new Set(STATIC_CACHE.map(path => new URL(path, ROOT).pathname));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin || !ALLOWED.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone());
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.open(CACHE_NAME).then(cache => cache.match(new URL('index.html', ROOT).href)) : Response.error()));
});
