
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    saveHospitals, getOfflineHospitals,
    saveRoute, getOfflineRoute,
    saveDoctors,
    getCacheStatus, saveMeta,
} from '../utils/offlineStore';
import { getInitialHospitals, getRouteGeometry } from '../services/apiService';

const MAX_ROUTES_TO_CACHE = 10; // cache routes to top N nearest hospitals

export const useOfflineSync = (userLocation) => {
    const [isOnline,       setIsOnline]       = useState(navigator.onLine);
    const [isSyncing,      setIsSyncing]      = useState(false);
    const [cacheStatus,    setCacheStatus]    = useState(null);
    const [offlineHospitals, setOfflineHospitals] = useState([]);
    const syncedRef = useRef(false);

    // ── Network status listeners ───────────────────────────────────────────
    useEffect(() => {
        const goOnline  = () => { setIsOnline(true);  };
        const goOffline = () => { setIsOnline(false); loadOfflineData(); };

        window.addEventListener('online',  goOnline);
        window.addEventListener('offline', goOffline);

        // Listen for service worker message (sync restored)
        navigator.serviceWorker?.addEventListener('message', (e) => {
            if (e.data?.type === 'ONLINE_RESTORED') setIsOnline(true);
        });

        return () => {
            window.removeEventListener('online',  goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    // ── Load cached data on mount ──────────────────────────────────────────
    useEffect(() => {
        loadOfflineData();
        getCacheStatus().then(setCacheStatus);
    }, []);

    const loadOfflineData = useCallback(async () => {
        try {
            const hospitals = await getOfflineHospitals();
            if (hospitals.length > 0) setOfflineHospitals(hospitals);
        } catch (err) {
            console.warn('[Offline] Could not load cached hospitals:', err.message);
        }
    }, []);

    // ── Sync when online + location available ─────────────────────────────
    useEffect(() => {
        if (!isOnline || !userLocation || syncedRef.current) return;
        syncedRef.current = true;
        prefetchData(userLocation);
    }, [isOnline, userLocation]);

    const prefetchData = useCallback(async (location) => {
        setIsSyncing(true);
        try {
            // 1. Fetch hospitals
            const hospitals = await getInitialHospitals(location[0], location[1]);
            if (!hospitals?.length) return;

            // Annotate with cached_at
            const stamped = hospitals.map(h => ({ ...h, cached_at: Date.now() }));
            await saveHospitals(stamped);
            setOfflineHospitals(stamped);

            // 2. Precompute routes for top N nearest hospitals
            const topHospitals = hospitals
                .filter(h => h.lat && h.lon)
                .slice(0, MAX_ROUTES_TO_CACHE);

            await Promise.allSettled(
                topHospitals.map(async (h) => {
                    try {
                        const route = await getRouteGeometry(
                            location[0], location[1],
                            parseFloat(h.lat), parseFloat(h.lon)
                        );
                        if (route) {
                            await saveRoute(h.hospital_id, {
                                geometry:           route.geometry ?? route,
                                total_time_minutes: route.total_time_minutes,
                                total_distance_m:   route.total_distance_m,
                                steps:              route.steps ?? [],
                                routing_method:     route.routing_method ?? 'cached',
                            });
                        }
                    } catch {
                        // Route fetch failed — skip silently
                    }
                })
            );

            // 3. Save sync location + time
            await saveMeta('last_sync_location', location);
            const status = await getCacheStatus();
            setCacheStatus(status);

            console.log(`[Offline] Cached ${stamped.length} hospitals + ${topHospitals.length} routes`);
        } catch (err) {
            console.warn('[Offline] Prefetch failed:', err.message);
        } finally {
            setIsSyncing(false);
        }
    }, []);

    // ── Get route: offline-first ───────────────────────────────────────────
    const getRoute = useCallback(async (hospitalId, fromLoc, toLat, toLon) => {
        if (isOnline) {
            // Online: use live route + cache it
            try {
                const route = await getRouteGeometry(fromLoc[0], fromLoc[1], toLat, toLon);
                if (route) saveRoute(hospitalId, route);
                return { ...route, fromCache: false };
            } catch {
                // Fall through to cache
            }
        }

        // Offline: use cached route
        const cached = await getOfflineRoute(hospitalId);
        return cached ? { ...cached, fromCache: true } : null;
    }, [isOnline]);

    return {
        isOnline,
        isSyncing,
        cacheStatus,
        offlineHospitals,
        getRoute,
        forceSync: () => { syncedRef.current = false; prefetchData(userLocation); },
    };
};