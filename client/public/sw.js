const CACHE_NAME = "marktwin-shell-v3";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/app-icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.url.includes("/api/") || event.request.url.includes("/signal")) return;
  // Never satisfy executable application code from Cache Storage. Hashed
  // assets can use the browser HTTP cache, while navigations remain
  // network-first with the shell reserved only for genuine offline use.
  if (event.request.destination === "script" || event.request.destination === "style") return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && event.request.destination !== "document") {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("/") : undefined))));
});
