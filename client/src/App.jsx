
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, MapIcon } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { useDebounce } from './hooks/useDebounce';

// ─── Lazy-loaded heavy panels — only fetched when user first opens them ───────
// Reduces initial bundle from ~800KB to ~400KB → 40% faster first load.

const BlackspotMap       = lazy(() => import('./components/analytics/BlackspotMap'));
const AdvancedParetoPanel = lazy(() => import('./components/analytics/AdvancedParetoPanel'));
const SmsQueryModal      = lazy(() => import('./components/modals/SmsQueryModal'));

import MapView            from './components/map/MapView';
import MainSearchView     from './components/views/MainSearchView';
import HospitalDetailView from './components/views/HospitalDetailView';
import DoctorBookingModal from './components/modals/DoctorBookingModal';
import NavigationView     from './components/views/NavigationView';
import VoiceQueryButton   from './components/analytics/VoiceQueryButton';
import Loader             from './components/common/Loader';

import {
    getInitialHospitals,
    searchBySpecialty,
    getHospitalsByDecisionMode,
    getEmergencyHospitals,
    getHospitalLoadStatus,
    getCurrentlyAvailable,
} from './services/apiService';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 720;
const SIDEBAR_DEFAULT_PCT = 0.35;

// Mobile drawer snap positions (% of viewport height for the LIST panel)
const SNAP_FULL   = 92;  // list fills screen, tiny map peek at bottom
const SNAP_HALF   = 52;  // 50/50 split
const SNAP_PEEK   = 14;  // map mostly visible, list peeking at bottom

function App() {
    // ─── Location ──────────────────────────────────────────────────────────
    const [userLocation,   setUserLocation]   = useState(null);
    const [locationError,  setLocationError]  = useState('');

    // ─── Results / UI ───────────────────────────────────────────────────────
    const [searchResults,  setSearchResults]  = useState([]);
    const [routingMode,    setRoutingMode]    = useState('bdAstar_time');
    const [isLoading,      setIsLoading]      = useState(true);
    const [error,          setError]          = useState('');

    // ─── Mobile drawer state (% of vh for the LIST panel height) ────────────
    const [drawerPct,      setDrawerPct]      = useState(SNAP_FULL);
    const drawerDragging   = useRef(false);
    const drawerStartY     = useRef(0);
    const drawerStartPct   = useRef(SNAP_FULL);

    // ─── Analytics panels ─────────────────────────────────────────────────────
    const [showBlackspots, setShowBlackspots] = useState(false);
    const [showAdvancedPareto,  setShowAdvancedPareto]  = useState(false);
    const [advancedParetoData,  setAdvancedParetoData]  = useState([]);  // enriched from AdvancedParetoPanel

    // ─── Offline detection → auto-open SMS modal ─────────────────────────────
    const [showSmsModal,    setShowSmsModal]    = useState(false);
    const [isOnline,        setIsOnline]        = useState(navigator.onLine);
    const [smsQueue,        setSmsQueue]        = useState(() => {
        try { return JSON.parse(localStorage.getItem('geohealth_sms_queue') || '[]'); }
        catch { return []; }
    });

    useEffect(() => {
        let offlineTimer = null;

        const handleOffline = () => {
            setIsOnline(false);
            // Wait 3 seconds before showing modal (avoid false positives)
            offlineTimer = setTimeout(() => {
                setShowSmsModal(true);
            }, 3000);
        };

        const handleOnline = () => {
            setIsOnline(true);
            clearTimeout(offlineTimer);
            // Fire any queued SMS requests
            const queue = JSON.parse(localStorage.getItem('geohealth_sms_queue') || '[]');
            if (queue.length > 0) {
                queue.forEach(async (item) => {
                    try {
                        const apiBase = import.meta.env.VITE_API_URL || '/api';
                        await fetch(`${apiBase}/sms/send`, {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body:    JSON.stringify(item),
                        });
                        console.log('[SMS Queue] Sent queued request:', item.message);
                    } catch (e) {
                        console.warn('[SMS Queue] Failed to send:', e.message);
                    }
                });
                localStorage.removeItem('geohealth_sms_queue');
                setSmsQueue([]);
            }
        };

        window.addEventListener('online',  handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            clearTimeout(offlineTimer);
            window.removeEventListener('online',  handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    const [loadStatusMap,      setLoadStatusMap]      = useState(new Map());
    const [compareHospitals,   setCompareHospitals]   = useState([]);
    const [annotatedHospitals, setAnnotatedHospitals] = useState([]);

    // ─── Desktop sidebar drag ────────────────────────────────────────────────
    const [sidebarWidth,   setSidebarWidth]   = useState(null);
    const isDragging       = useRef(false);
    const dragStartX       = useRef(0);
    const dragStartWidth   = useRef(0);
    const containerRef     = useRef(null);

    // ─── URL params ─────────────────────────────────────────────────────────
    const [searchParams, setSearchParams] = useSearchParams();

    const query               = useMemo(() => searchParams.get('q'),              [searchParams]);
    const type                = useMemo(() => searchParams.get('type'),            [searchParams]);
    const radius              = useMemo(() => searchParams.get('radiusKm') || '',  [searchParams]);
    const decisionMode        = useMemo(() => searchParams.get('mode') || null,    [searchParams]);
    const isEmergencyMode     = useMemo(() => searchParams.get('emergency') === '1', [searchParams]);
    const isCurrentlyAvailable = useMemo(() => searchParams.get('now') === '1',   [searchParams]);
    const selectedHospitalId  = useMemo(() => searchParams.get('hospital'),        [searchParams]);
    const navigatingToHospitalId = useMemo(() => searchParams.get('navigatingTo'), [searchParams]);
    const doctorIdToBook      = useMemo(() => searchParams.get('bookDoctor'),      [searchParams]);

    const selectedHospital = useMemo(() => {
        const id = selectedHospitalId || navigatingToHospitalId;
        if (!id) return null;
        return searchResults.find(h => h.hospital_id === parseInt(id)) ?? null;
    }, [selectedHospitalId, navigatingToHospitalId, searchResults]);

    // ─── Geolocation — works offline (GPS doesn't need internet) ───────────
    useEffect(() => {
        // Try to restore last known location from localStorage instantly
        const cached = localStorage.getItem('geohealth_last_location');
        if (cached) {
            try {
                const { lat, lon } = JSON.parse(cached);
                setUserLocation([lat, lon]); // set immediately so app renders
            } catch (_) {}
        }

        if (!navigator.geolocation) {
            setUserLocation([22.34, 87.31]);
            return;
        }

        // GPS works offline — it uses device hardware, not internet
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = [pos.coords.latitude, pos.coords.longitude];
                setUserLocation(loc);
                // Cache for next offline load
                localStorage.setItem('geohealth_last_location',
                    JSON.stringify({ lat: loc[0], lon: loc[1], at: Date.now() }));
            },
            () => {
                // If GPS fails and no cache, use Kharagpur center
                if (!localStorage.getItem('geohealth_last_location')) {
                    setLocationError('Location access denied. Using default.');
                    setUserLocation([22.34, 87.31]);
                }
                // If GPS fails but we have cache, the cached location above is already set
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 60000,   // accept a 1-min old GPS fix when offline
            }
        );
    }, []);

    // Hospital load status — fetch lazily after 2s delay so it doesn't
    // compete with the main hospital list fetch on initial load.
    // Refresh every 3 min (not 30s) to save DB load.
    useEffect(() => {
        let timer;
        const fetchLoad = () => getHospitalLoadStatus()
            .then(setLoadStatusMap)
            .catch(() => {});  // silent — non-critical

        timer = setTimeout(() => {
            fetchLoad();
            // Refresh every 3 min (180s)
            const interval = setInterval(fetchLoad, 180_000);
            timer = interval;
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    // ─── Main data fetch ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!userLocation) return;

        if (selectedHospitalId) {
            const found = searchResults.find(h => h.hospital_id === parseInt(selectedHospitalId));
            if (searchResults.length === 0 || !found || found.lat == null) {
                getInitialHospitals(userLocation[0], userLocation[1], radius)
                    .then(setSearchResults)
                    .catch(err => setError(err.message));
            }
            return;
        }

        // Abort previous in-flight request when deps change
        const controller = new AbortController();

        const fetchData = async () => {
            setIsLoading(true);
            setError('');
            try {
                let data;
                const opts = { signal: controller.signal };
                if (isCurrentlyAvailable) {
                    data = await getCurrentlyAvailable(userLocation[0], userLocation[1], opts);
                } else if (isEmergencyMode) {
                    data = await getEmergencyHospitals(userLocation[0], userLocation[1], opts);
                } else if (decisionMode) {
                    data = await getHospitalsByDecisionMode(userLocation[0], userLocation[1], decisionMode, opts);
                } else if (type === 'specialty' && query) {
                    data = await searchBySpecialty(query, userLocation[0], userLocation[1], null, radius, opts);
                } else {
                    data = await getInitialHospitals(userLocation[0], userLocation[1], radius, opts);
                }
                if (!controller.signal.aborted) setSearchResults(data ?? []);

            } catch (err) {
                if (err?.name === 'AbortError' || err?.message === 'canceled') return;

                const isNetworkError =
                    err?.code === 'ERR_NETWORK' ||
                    err?.message?.includes('Network') ||
                    err?.message?.includes('fetch') ||
                    err?.message?.includes('ECONNABORTED') ||
                    !navigator.onLine;

                if (isNetworkError && !isCurrentlyAvailable && !isEmergencyMode && !decisionMode && !query) {
                    try {
                        const { getOfflineHospitals } = await import('./utils/offlineStore.js');
                        const cached = await getOfflineHospitals();
                        if (cached.length > 0) {
                            setSearchResults(cached);
                            setError('');
                            return;
                        }
                    } catch (_) {}
                    setError('You are offline. No cached data available.');
                } else if (isCurrentlyAvailable && isNetworkError) {
                    setError('Live doctor availability requires internet. Please connect.');
                } else {
                    setError(err?.response?.data?.error || err.message || 'Something went wrong.');
                }
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        };

        fetchData();
        return () => controller.abort();   // cleanup on unmount / dep change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLocation, query, type, radius, selectedHospitalId,
        decisionMode, isEmergencyMode, isCurrentlyAvailable, searchResults.length]);

    // ─── Mobile drawer drag handlers ─────────────────────────────────────────

    const onDrawerDragStart = useCallback((e) => {
        if (window.innerWidth >= 768) return; // desktop only uses sidebar
        drawerDragging.current  = true;
        drawerStartY.current    = e.touches?.[0]?.clientY ?? e.clientY;
        drawerStartPct.current  = drawerPct;
        e.preventDefault();
    }, [drawerPct]);

    useEffect(() => {
        const onMove = (e) => {
            if (!drawerDragging.current) return;
            const clientY  = e.touches?.[0]?.clientY ?? e.clientY;
            const deltaPx  = drawerStartY.current - clientY;
            const deltaPct = (deltaPx / window.innerHeight) * 100;
            const newPct   = Math.max(SNAP_PEEK, Math.min(SNAP_FULL, drawerStartPct.current + deltaPct));
            setDrawerPct(newPct);
        };

        const onEnd = () => {
            if (!drawerDragging.current) return;
            drawerDragging.current = false;
            // Snap to nearest position
            setDrawerPct(prev => {
                const diffs = [SNAP_PEEK, SNAP_HALF, SNAP_FULL].map(s => Math.abs(s - prev));
                const idx   = diffs.indexOf(Math.min(...diffs));
                return [SNAP_PEEK, SNAP_HALF, SNAP_FULL][idx];
            });
        };

        window.addEventListener('touchmove',   onMove, { passive: false });
        window.addEventListener('touchend',    onEnd);
        window.addEventListener('mousemove',   onMove);
        window.addEventListener('mouseup',     onEnd);
        return () => {
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend',  onEnd);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onEnd);
        };
    }, []);

    // ─── Desktop sidebar drag ─────────────────────────────────────────────────

    const onSidebarDragStart = useCallback((e) => {
        if (window.innerWidth < 768) return;
        isDragging.current     = true;
        dragStartX.current     = e.clientX;
        dragStartWidth.current = sidebarWidth ?? Math.round(window.innerWidth * SIDEBAR_DEFAULT_PCT);
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }, [sidebarWidth]);

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isDragging.current) return;
            const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + (e.clientX - dragStartX.current)));
            setSidebarWidth(newWidth);
        };
        const onMouseUp = () => {
            if (!isDragging.current) return;
            isDragging.current             = false;
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup',   onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup',   onMouseUp);
        };
    }, []);

    // ─── URL helpers ─────────────────────────────────────────────────────────

    const handleSetSearch = (params) => {
        const r = searchParams.get('radiusKm');
        if (r && !params.radiusKm) params.radiusKm = r;
        setSearchParams(params, { replace: true });
    };

    const handleSetRadius = (newRadius) => {
        const next = { ...Object.fromEntries(searchParams) };
        if (newRadius) { next.radiusKm = newRadius; } else { delete next.radiusKm; }
        setSearchParams(next, { replace: true });
    };

    const handleHospitalSelect = (hospitalId) => {
        const next = { ...Object.fromEntries(searchParams) };
        next.hospital = hospitalId;
        delete next.navigatingTo;
        setSearchParams(next, { replace: true });
        // On mobile, snap to half so map is visible with the route
        if (window.innerWidth < 768) setDrawerPct(SNAP_HALF);
    };

    const handleDoctorSelect    = (doctorId) =>
        setSearchParams({ ...Object.fromEntries(searchParams), bookDoctor: doctorId });

    const handleStartNavigation = (hospitalId) =>
        setSearchParams({ navigatingTo: hospitalId });

    const handleBackToSearch = () => {
        const next = {};
        const r = searchParams.get('radiusKm');
        if (r) next.radiusKm = r;
        setSearchParams(next, { replace: true });
        if (window.innerWidth < 768) setDrawerPct(SNAP_FULL);
    };

    const closeModal = () => {
        const next = { ...Object.fromEntries(searchParams) };
        delete next.bookDoctor;
        setSearchParams(next, { replace: true });
    };

    const handleDecisionMode = (mode) => {
        const next = {};
        const r = searchParams.get('radiusKm');
        if (r) next.radiusKm = r;
        if (mode) next.mode = mode;
        setSearchParams(next, { replace: true });
    };

    const handleEmergencyToggle = () => {
        const next = {};
        const r = searchParams.get('radiusKm');
        if (r) next.radiusKm = r;
        if (!isEmergencyMode) next.emergency = '1';
        setSearchParams(next, { replace: true });
    };

    const handleCurrentlyAvailableToggle = () => {
        const next = {};
        const r = searchParams.get('radiusKm');
        if (r) next.radiusKm = r;
        if (!isCurrentlyAvailable) next.now = '1';
        setSearchParams(next, { replace: true });
    };

    // ─── Left panel content ───────────────────────────────────────────────────

    const renderLeftPanel = () => {
        if (!userLocation) {
            return <Loader message={locationError || 'Fetching your location…'} />;
        }

        if (selectedHospitalId) {
            return (
                <HospitalDetailView
                    hospital={selectedHospital}
                    onBack={handleBackToSearch}
                    onDoctorSelect={handleDoctorSelect}
                    onStartNavigation={handleStartNavigation}
                />
            );
        }

        return (
            <MainSearchView
                userLocation={userLocation}
                onHospitalSelect={handleHospitalSelect}
                onDoctorSelect={handleDoctorSelect}
                onSetSearch={handleSetSearch}
                radius={radius}
                setRadius={handleSetRadius}
                searchResults={searchResults}
                isLoading={isLoading}
                error={error}
                decisionMode={decisionMode}
                onDecisionMode={handleDecisionMode}
                isEmergencyMode={isEmergencyMode}
                onEmergencyToggle={handleEmergencyToggle}
                isCurrentlyAvailable={isCurrentlyAvailable}
                onCurrentlyAvailableToggle={handleCurrentlyAvailableToggle}
                onShowBlackspots={() => setShowBlackspots(true)}
                onShowAdvancedPareto={() => setShowAdvancedPareto(true)}
                onShowSms={() => setShowSmsModal(true)}
                advancedParetoData={advancedParetoData}
                loadStatusMap={loadStatusMap}
                onCompareHospitalsChange={setCompareHospitals}
                onAnnotatedChange={setAnnotatedHospitals}
            />
        );
    };

    const mapView = (
        <MapView
            userLocation={userLocation}
            hospitals={searchResults}
            annotatedHospitals={annotatedHospitals}
            hospital={selectedHospital}
            onMarkerClick={handleHospitalSelect}
            searchType={type}
            radiusKm={radius}
            routingMode={routingMode}
            setRoutingMode={setRoutingMode}
            loadStatusMap={loadStatusMap}
            compareHospitals={compareHospitals}
        />
    );

    // ─── Navigation full-screen ───────────────────────────────────────────────

    if (navigatingToHospitalId && selectedHospital && userLocation) {
        return (
            <NavigationView
                userLocation={userLocation}
                hospital={selectedHospital}
                onClose={handleBackToSearch}
            />
        );
    }

    // ─── Desktop sidebar style ────────────────────────────────────────────────

    const sidebarStyle = sidebarWidth
        ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px`, maxWidth: `${sidebarWidth}px` }
        : {};

    // ─── Snap indicator dots ──────────────────────────────────────────────────

    const snapDots = [SNAP_FULL, SNAP_HALF, SNAP_PEEK].map(snap => (
        <span
            key={snap}
            className={`block w-1.5 h-1.5 rounded-full transition-all ${Math.abs(drawerPct - snap) < 8 ? 'bg-indigo-600 scale-125' : 'bg-slate-300'}`}
        />
    ));

    return (
        <div ref={containerRef} className="h-[100dvh] w-full bg-slate-100 overflow-hidden">
            <Analytics />

            {/* ════════════════════════════════════════════════════════════
                DESKTOP LAYOUT (md and above) — side-by-side
            ════════════════════════════════════════════════════════════ */}
            <div className="hidden md:flex h-full w-full flex-row">

                {/* Sidebar */}
                <div
                    style={sidebarStyle}
                    className={`relative flex-shrink-0 h-full bg-white shadow-lg z-20 ${!sidebarWidth ? 'w-[45%] lg:w-[35%]' : ''}`}
                >
                    <div className="h-full flex flex-col">{renderLeftPanel()}</div>
                </div>

                {/* Drag handle */}
                <div
                    onMouseDown={onSidebarDragStart}
                    className="w-1.5 flex-shrink-0 z-30 flex items-center justify-center cursor-col-resize bg-slate-200 hover:bg-indigo-400 transition-colors duration-150 group relative"
                    title="Drag to resize"
                >
                    <div className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                        {[...Array(5)].map((_, i) => (
                            <span key={i} className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-white transition-colors" />
                        ))}
                    </div>
                </div>

                {/* Map */}
                <div className="flex-grow h-full z-10">{mapView}</div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                MOBILE LAYOUT — map behind, bottom-sheet list drawer
            ════════════════════════════════════════════════════════════ */}
            <div className="md:hidden h-full w-full relative flex flex-col">

                {/* Map layer — always visible behind */}
                <div
                    className="absolute inset-0 z-0"
                    style={{ bottom: `${drawerPct}dvh` }}
                >
                    {mapView}
                </div>

                {/* Map peek area — tap to expand map */}
                {drawerPct > SNAP_PEEK + 4 && (
                    <div
                        className="absolute z-10 bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-full shadow-md cursor-pointer mb-1"
                        style={{ bottom: `${drawerPct}dvh`, marginBottom: '4px' }}
                        onClick={() => setDrawerPct(SNAP_PEEK)}
                    >
                        <MapIcon size={13} className="text-indigo-600" />
                        <span className="text-xs font-semibold text-indigo-700">See map</span>
                        <ChevronDown size={13} className="text-indigo-500" />
                    </div>
                )}

                {/* Bottom sheet list drawer */}
                <div
                    className="absolute z-20 left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
                    style={{
                        height:     `${drawerPct}dvh`,
                        transition: drawerDragging.current ? 'none' : 'height 0.3s cubic-bezier(0.32,0.72,0,1)',
                    }}
                >
                    {/* Drag handle bar */}
                    <div
                        className="flex-shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={onDrawerDragStart}
                        onTouchStart={onDrawerDragStart}
                    >
                        {/* Visual pill */}
                        <div className="w-10 h-1 bg-slate-300 rounded-full mb-2" />

                        {/* Snap position indicator dots */}
                        <div className="flex items-center gap-1.5">
                            {snapDots}
                        </div>

                        {/* Expand/collapse hint when peeking */}
                        {drawerPct <= SNAP_PEEK + 4 && (
                            <div
                                className="flex items-center gap-1 mt-1.5 text-xs text-indigo-600 font-semibold cursor-pointer"
                                onClick={() => setDrawerPct(SNAP_FULL)}
                            >
                                <ChevronUp size={14} />
                                Hospitals
                            </div>
                        )}
                    </div>

                    {/* Panel content */}
                    <div className="flex-grow overflow-hidden">
                        {renderLeftPanel()}
                    </div>
                </div>
            </div>

            {/* Doctor booking modal */}
            {doctorIdToBook && userLocation && (
                <DoctorBookingModal
                    doctorId={doctorIdToBook}
                    hospitalId={selectedHospitalId}
                    userLocation={userLocation}
                    onClose={closeModal}
                />
            )}

            {/* SMS modal — lazy loaded, auto-opens when offline */}
            {showSmsModal && (
                <Suspense fallback={null}>
                    <SmsQueryModal
                        userLocation={userLocation}
                        isOnline={isOnline}
                        smsQueue={smsQueue}
                        onQueueAdd={(item) => {
                            const next = [...smsQueue, item];
                            setSmsQueue(next);
                            localStorage.setItem('geohealth_sms_queue', JSON.stringify(next));
                        }}
                        onClose={() => setShowSmsModal(false)}
                    />
                </Suspense>
            )}

            {/* Blackspot heatmap — lazy loaded (heavy Leaflet heatmap) */}
            {showBlackspots && (
                <Suspense fallback={
                    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                        <div className="text-white text-center">
                            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-sm font-semibold">Loading blackspot map…</p>
                        </div>
                    </div>
                }>
                    <BlackspotMap onClose={() => setShowBlackspots(false)} />
                </Suspense>
            )}

            {/* Advanced Pareto Optimal — lazy loaded */}
            {showAdvancedPareto && (
                <Suspense fallback={
                    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                        <div className="text-white text-center">
                            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-sm font-semibold">Running analysis…</p>
                        </div>
                    </div>
                }>
                    <AdvancedParetoPanel
                        userLocation={userLocation}
                        onHospitalSelect={handleHospitalSelect}
                        onAnnotated={(data) => setAdvancedParetoData(data)}
                        onClose={() => setShowAdvancedPareto(false)}
                    />
                </Suspense>
            )}

            {/* Voice query floating button */}
            {userLocation && (
                <VoiceQueryButton
                    userLocation={userLocation}
                    onHospitalSelect={handleHospitalSelect}
                />
            )}
        </div>
    );
}

export default App;