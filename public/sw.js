const CACHE_NAME = 'nexus-v28';
const STATIC_ASSETS = [
    '/',
    '/css/style.css',
    '/js/app.js',
    '/js/dashboard-utils.js',
    '/js/dashboard/constants.js',
    '/js/dashboard/charts.js',
    '/js/dashboard/tables.js',
    '/js/dashboard/exports.js',
    '/js/dashboard/analytics.js',
    '/js/dashboard/widgets.js',
    '/js/dashboard/main.js',
    '/js/ordens-servico.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests - Cache API does not support POST
    if (event.request.method !== 'GET') return;

    if (
        event.request.url.includes('/api/') ||
        event.request.url.endsWith('.js') ||
        event.request.url.endsWith('.css')
    ) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    }
});
