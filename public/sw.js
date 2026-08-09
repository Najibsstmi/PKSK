const CACHE_NAME = "pksk-academy-shell-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png"
];
const FALLBACK_HTML = `<!doctype html>
<html lang="ms">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PKSK Academy</title>
  </head>
  <body>
    <script>window.location.replace("/");</script>
    <p>PKSK Academy sedang dibuka semula...</p>
  </body>
</html>`;

function appShellResponse() {
  return caches
    .match("/index.html")
    .then((cachedShell) => cachedShell || caches.match("/"))
    .then((cachedShell) => cachedShell || new Response(FALLBACK_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((url) => fetch(url).then((response) => (response.ok ? cache.put(url, response) : null)).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            return response;
          }

          if (response.status === 404) {
            return appShellResponse();
          }

          return response;
        })
        .catch(() => appShellResponse()),
    );
  }
});
