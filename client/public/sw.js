// =============================================================================
//  public/sw.js  —  GeoHealth Service Worker
// =============================================================================

const CACHE_NAME = 'geohealth-v1';
const DATA_CACHE = 'geohealth-data-v1';
const TILE_CACHE = 'geohealth-tiles-v1';

const APP_SHELL = ['/', '/index.html', '/offline.html'];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => ![CACHE_NAME, DATA_CACHE, TILE_CACHE].includes(k))
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // ── SKIP: non-http, blob, data, chrome-extension, etc. ────────────────
    // Leaflet uses blob: URLs for worker scripts — never intercept these
    if (!req.url.startsWith('http')) return;

    // ── SKIP: cross-origin requests that aren't map tiles or our API ───────
    const isOurAPI  = url.hostname.includes('vercel.app') ||
                      url.hostname === 'localhost';
    const isTile    = url.hostname.includes('tile.openstreetmap.org');
    const isORS     = url.hostname.includes('openrouteservice.org');

    if (!isOurAPI && !isTile) return; // let Leaflet handle everything else natively

    // ── Map tiles → cache-first ────────────────────────────────────────────
    if (isTile) {
        event.respondWith(tileStrategy(req));
        return;
    }

    // ── Our API: hospital/route data → cache-first, refresh in background ──
    if (isOurAPI && (
        url.pathname.includes('/api/hospitals') ||
        url.pathname.includes('/api/route')     ||
        url.pathname.includes('/api/pareto')
    )) {
        event.respondWith(cacheFirstWithRefresh(req));
        return;
    }

    // ── Our API: live data → network-first, cache fallback ────────────────
    if (isOurAPI && url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstWithFallback(req));
        return;
    }

    // ── App shell ──────────────────────────────────────────────────────────
    if (isOurAPI) {
        event.respondWith(
            caches.match(req).then(cached =>
                cached || fetch(req).catch(() => caches.match('/offline.html'))
            )
        );
    }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function tileStrategy(request) {
    const cache  = await caches.open(TILE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return cached || new Response('', { status: 503 });
    }
}

async function cacheFirstWithRefresh(request) {
    const cache      = await caches.open(DATA_CACHE);
    const cached     = await cache.match(request);
    const fetchAsync = fetch(request)
        .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
        .catch(() => null);
    return cached || await fetchAsync ||
        new Response(JSON.stringify({ error: 'Offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } });
}

async function networkFirstWithFallback(request) {
    const cache = await caches.open(DATA_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return await cache.match(request) ||
            new Response(JSON.stringify({ error: 'Offline', offline: true }),
                { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
}

// ─── Online restored → notify clients ────────────────────────────────────────

self.addEventListener('sync', async (event) => {
    if (event.tag === 'sync-offline-requests') {
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({ type: 'ONLINE_RESTORED' }));
    }
});