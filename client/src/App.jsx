
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapIcon, List } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';

import MapView            from './components/map/MapView';
import MainSearchView     from './components/views/MainSearchView';
import HospitalDetailView from './components/views/HospitalDetailView';
import DoctorBookingModal from './components/modals/DoctorBookingModal';
import NavigationView     from './components/views/NavigationView';
import Loader             from './components/common/Loader';

import {
    getInitialHospitals,
    searchBySpecialty,
    getHospitalsByDecisionMode,
    getEmergencyHospitals,
    getHospitalLoadStatus,
} from './services/apiService';

// ─── Sidebar width constraints (desktop, px) ─────────────────────────────────
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 720;
const SIDEBAR_DEFAULT_PCT = 0.35; // 35% of window width

function App() {
    // ─── Location ──────────────────────────────────────────────────────────
    const [userLocation,   setUserLocation]   = useState(null);
    const [locationError,  setLocationError]  = useState('');

    // ─── Results / UI ───────────────────────────────────────────────────────
    const [searchResults,  setSearchResults]  = useState([]);
    const [mobileView,     setMobileView]     = useState('list');
    const [routingMode,    setRoutingMode]    = useState('osrm');
    const [isLoading,      setIsLoading]      = useState(true);
    const [error,          setError]          = useState('');

    // ─── Load-status map ────────────────────────────────────────────────────
    const [loadStatusMap,      setLoadStatusMap]      = useState(new Map());

    // ─── Compare + annotated ────────────────────────────────────────────────
    const [compareHospitals,   setCompareHospitals]   = useState([]);
    const [annotatedHospitals, setAnnotatedHospitals] = useState([]);

    // ─── Draggable sidebar (desktop only) ───────────────────────────────────
    const [sidebarWidth,   setSidebarWidth]   = useState(null); // null = CSS default
    const isDragging       = useRef(false);
    const dragStartX       = useRef(0);
    const dragStartWidth   = useRef(0);
    const containerRef     = useRef(null);

    // ─── URL params ─────────────────────────────────────────────────────────
    const [searchParams, setSearchParams] = useSearchParams();

    const query              = useMemo(() => searchParams.get('q'),              [searchParams]);
    const type               = useMemo(() => searchParams.get('type'),            [searchParams]);
    const radius             = useMemo(() => searchParams.get('radiusKm') || '',  [searchParams]);
    const decisionMode       = useMemo(() => searchParams.get('mode') || null,    [searchParams]);
    const isEmergencyMode    = useMemo(() => searchParams.get('emergency') === '1', [searchParams]);
    const selectedHospitalId = useMemo(() => searchParams.get('hospital'),        [searchParams]);
    const navigatingToHospitalId = useMemo(() => searchParams.get('navigatingTo'), [searchParams]);
    const doctorIdToBook     = useMemo(() => searchParams.get('bookDoctor'),      [searchParams]);

    const selectedHospital = useMemo(() => {
        const id = selectedHospitalId || navigatingToHospitalId;
        if (!id) return null;
        return searchResults.find(h => h.hospital_id === parseInt(id)) ?? null;
    }, [selectedHospitalId, navigatingToHospitalId, searchResults]);

    // ─── Geolocation ────────────────────────────────────────────────────────
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
            ()    => {
                setLocationError('Location access denied. Using a default location.');
                setUserLocation([22.34, 87.31]);
            }
        );
    }, []);

    useEffect(() => {
        getHospitalLoadStatus().then(setLoadStatusMap);
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

        const fetchData = async () => {
            setIsLoading(true);
            setError('');
            try {
                let data;
                if (isEmergencyMode) {
                    data = await getEmergencyHospitals(userLocation[0], userLocation[1]);
                } else if (decisionMode) {
                    data = await getHospitalsByDecisionMode(userLocation[0], userLocation[1], decisionMode);
                } else if (type === 'specialty' && query) {
                    data = await searchBySpecialty(query, userLocation[0], userLocation[1], null, radius);
                } else {
                    data = await getInitialHospitals(userLocation[0], userLocation[1], radius);
                }
                setSearchResults(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLocation, query, type, radius, selectedHospitalId, decisionMode, isEmergencyMode, searchResults.length]);

    // ─── Draggable resize (desktop only) ────────────────────────────────────

    const onDragStart = useCallback((e) => {
        // Only on desktop (md+)
        if (window.innerWidth < 768) return;
        isDragging.current   = true;
        dragStartX.current   = e.clientX;
        dragStartWidth.current = sidebarWidth ??
            Math.round(window.innerWidth * SIDEBAR_DEFAULT_PCT);
        document.body.style.cursor    = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }, [sidebarWidth]);

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isDragging.current) return;
            const delta   = e.clientX - dragStartX.current;
            const newWidth = Math.min(
                SIDEBAR_MAX,
                Math.max(SIDEBAR_MIN, dragStartWidth.current + delta)
            );
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
        setMobileView('list');
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
                loadStatusMap={loadStatusMap}
                onCompareHospitalsChange={setCompareHospitals}
                onAnnotatedChange={setAnnotatedHospitals}
            />
        );
    };

    // ─── Full-screen navigation view ──────────────────────────────────────────

    if (navigatingToHospitalId && selectedHospital && userLocation) {
        return (
            <NavigationView
                userLocation={userLocation}
                hospital={selectedHospital}
                onClose={handleBackToSearch}
            />
        );
    }

    // ─── Main layout ──────────────────────────────────────────────────────────

    // Desktop sidebar style: use dragged width if set, else CSS fallback
    const sidebarStyle = sidebarWidth
        ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px`, maxWidth: `${sidebarWidth}px` }
        : {};

    return (
        <div
            ref={containerRef}
            className="h-[100dvh] w-full bg-slate-100 flex flex-col md:flex-row overflow-hidden relative"
        >
            <Analytics />

            {/* ── Left sidebar panel ─────────────────────────────────────── */}
            <div
                style={sidebarStyle}
                className={`
                    absolute md:relative w-full h-full z-20 bg-white shadow-lg
                    ${!sidebarWidth ? 'md:w-[45%] lg:w-[35%]' : ''}
                    transform transition-transform duration-300 ease-in-out
                    ${mobileView === 'list' ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0 flex-shrink-0
                `}
            >
                <div className="h-full flex flex-col">
                    {renderLeftPanel()}
                </div>
            </div>

            {/* ── Drag handle (desktop only) ─────────────────────────────── */}
            <div
                onMouseDown={onDragStart}
                className="
                    hidden md:flex
                    w-1.5 flex-shrink-0 z-30
                    items-center justify-center
                    cursor-col-resize
                    bg-slate-200 hover:bg-indigo-400
                    transition-colors duration-150
                    group relative
                "
                title="Drag to resize"
            >
                {/* Visual grip dots */}
                <div className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                    {[...Array(5)].map((_, i) => (
                        <span
                            key={i}
                            className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-white transition-colors"
                        />
                    ))}
                </div>
            </div>

            {/* ── Right map panel ────────────────────────────────────────── */}
            <div
                className={`
                    absolute md:relative w-full h-full flex-grow z-10
                    transform transition-transform duration-300 ease-in-out
                    ${mobileView === 'map' ? 'translate-x-0' : 'translate-x-full'}
                    md:translate-x-0
                `}
            >
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
            </div>

            {/* ── Mobile list/map toggle ─────────────────────────────────── */}
            <div className="md:hidden absolute bottom-4 right-4 z-30 flex gap-2">
                <button
                    onClick={() => setMobileView(v => v === 'list' ? 'map' : 'list')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
                >
                    {mobileView === 'list' ? <MapIcon size={20} /> : <List size={20} />}
                    <span>{mobileView === 'list' ? 'Map' : 'List'}</span>
                </button>
            </div>

            {/* ── Doctor booking modal ───────────────────────────────────── */}
            {doctorIdToBook && userLocation && (
                <DoctorBookingModal
                    doctorId={doctorIdToBook}
                    hospitalId={selectedHospitalId}
                    userLocation={userLocation}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}

export default App;