/* rep.et service worker — stale-while-revalidate */
const VERSION = "v2";
const CACHE = `repet-swr-${VERSION}`;
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Warm the cache with the app shell so the site loads offline.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isCacheableResponse = (response) =>
  response &&
  response.status === 200 &&
  (response.type === "basic" || response.type === "default");

async function staleWhileRevalidate(event, preloadPromise) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const networkUpdate = (async () => {
    const preloaded = preloadPromise ? await preloadPromise : null;
    const response = preloaded || (await fetch(request));
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  })();

  // Keep the SW alive long enough to consume the navigation preload and
  // finish writing to the cache. The .catch() also silences orphaned
  // rejections (e.g. when the user reloads mid-fetch and we already
  // returned a cached response).
  event.waitUntil(networkUpdate.catch(() => {}));

  if (cached) return cached;
  return networkUpdate;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await staleWhileRevalidate(event, event.preloadResponse);
        } catch {
          const cache = await caches.open(CACHE);
          const fallback = await cache.match(OFFLINE_URL);
          return fallback || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    staleWhileRevalidate(event).catch(() => Response.error()),
  );
});
