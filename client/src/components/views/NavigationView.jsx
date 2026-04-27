
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    MapContainer, TileLayer, GeoJSON,
    Marker, Popup, useMap, Polyline,
} from 'react-leaflet';
import L from 'leaflet';
import {
    X, Clock, Ruler, Zap, AlertTriangle,
    ChevronRight, RefreshCw, Mountain, Volume2, VolumeX,
} from 'lucide-react';
import { getOrsRoute, getRouteGeometry } from '../../services/apiService';
import RoutingMachine from '../map/RoutingMachine';
import { useTTS } from '../analytics/VoiceQueryButton';

// ─── Constants ────────────────────────────────────────────────────────────────

const REROUTE_THRESHOLD_M = 60;
const GPS_INTERVAL_MS     = 5000;

// ─── Turn types → arrow ───────────────────────────────────────────────────────

const TURN_ICON = {
    0:'↰', 1:'↱', 2:'↰', 3:'↱', 4:'↑', 5:'↰', 6:'↱',
    7:'↰', 8:'↱', 10:'↑', 11:'↑', 12:'🏁', 13:'🏁',
};

// ─── Deviation detection ──────────────────────────────────────────────────────

function distanceFromRouteM(latLon, geoJSON) {
    if (!geoJSON) return Infinity;
    let lines = [];
    if (geoJSON.type === 'MultiLineString') lines = geoJSON.coordinates;
    else if (geoJSON.type === 'LineString') lines = [geoJSON.coordinates];
    else if (geoJSON.type === 'GeometryCollection') {
        geoJSON.geometries?.forEach(g => {
            if (g.type === 'MultiLineString') lines.push(...g.coordinates);
            else if (g.type === 'LineString') lines.push(g.coordinates);
        });
    }
    const [lat, lon] = latLon;
    const mLat = 111320;
    const mLon = 111320 * Math.cos(lat * Math.PI / 180);
    let minDist = Infinity;
    for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
            const [ax, ay] = line[i], [bx, by] = line[i + 1];
            const dx = bx - ax, dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / lenSq));
            const d = Math.hypot((lon - (ax + t * dx)) * mLon, (lat - (ay + t * dy)) * mLat);
            if (d < minDist) minDist = d;
        }
    }
    return minDist;
}

// ─── Auto-fit map ─────────────────────────────────────────────────────────────

function FitRoute({ geoJSON }) {
    const map = useMap();
    useEffect(() => {
        if (!geoJSON) return;
        try {
            const bounds = L.geoJSON(geoJSON).getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60] });
        } catch (_) {}
    }, [geoJSON, map]); // eslint-disable-line
    return null;
}

// ─── Step card ────────────────────────────────────────────────────────────────

const StepCard = ({ step, index, isOrs }) => {
    const dist    = step.distance_m >= 1000 ? `${(step.distance_m / 1000).toFixed(1)} km` : `${step.distance_m} m`;
    const timeSec = Math.round(step.time_s ?? 0);
    const timeStr = timeSec >= 60 ? `${Math.round(timeSec / 60)} min` : `${timeSec}s`;
    const arrow   = isOrs ? (TURN_ICON[step.type] ?? '→') : null;
    const dotColor = step.color ?? '#6366f1';

    return (
        <li className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-all">
            <span className="flex-shrink-0 w-7 h-7 rounded-full text-sm flex items-center justify-center font-bold mt-0.5 text-white"
                style={{ backgroundColor: dotColor }}>
                {arrow ?? (index + 1)}
            </span>
            <div className="flex-grow min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight">
                    {isOrs ? (step.instruction || step.road || 'Continue') : (step.road || 'Unnamed road')}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Ruler size={10} /> {dist}</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {timeStr}</span>
                    {step.speed_kmh > 0 && (
                        <span className="flex items-center gap-1" style={{ color: dotColor }}>
                            <Zap size={10} /> {step.speed_kmh} km/h
                        </span>
                    )}
                </div>
            </div>
            <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
        </li>
    );
};

// ─── Surface bar ─────────────────────────────────────────────────────────────

const SurfaceBar = ({ breakdown }) => {
    const COLORS = { Paved:'#4f46e5', Unpaved:'#f59e0b', Gravel:'#d97706', Dirt:'#92400e', Sand:'#fbbf24', Unknown:'#94a3b8' };
    return (
        <div className="mt-2">
            <p className="text-xs text-slate-500 mb-1">Road surface</p>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {breakdown.map(({ label, percent }) => percent > 0 && (
                    <div key={label} style={{ width:`${percent}%`, backgroundColor: COLORS[label] ?? '#94a3b8' }} title={`${label}: ${percent}%`} />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 mt-1">
                {breakdown.filter(b => b.percent > 0).map(({ label, percent }) => (
                    <span key={label} className="text-[10px] text-slate-500">
                        <span className="inline-block w-2 h-2 rounded-sm mr-0.5" style={{ backgroundColor: COLORS[label] ?? '#94a3b8' }} />
                        {label} {percent}%
                    </span>
                ))}
            </div>
        </div>
    );
};

// ─── Route color legend ───────────────────────────────────────────────────────

function RouteLegendControl() {
    const map = useMap();
    useEffect(() => {
        const control   = L.control({ position: 'bottomleft' });
        const container = L.DomUtil.create('div');
        container.style.cssText =
            'background:white;padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:11px;pointer-events:none;margin-bottom:2rem;';
        container.innerHTML = `
            <div style="font-weight:700;color:#334155;margin-bottom:5px;">Road Speed</div>
            ${[['#16a34a','≥ 60 km/h — Fast'],['#f59e0b','30–59 km/h — Moderate'],['#dc2626','< 30 km/h — Slow/Unpaved']].map(
                ([c, l]) => `<div style="display:flex;align-items:center;gap:6px;color:#475569;margin-top:3px;">
                    <span style="display:inline-block;width:24px;height:4px;background:${c};border-radius:2px;"></span>${l}
                </div>`
            ).join('')}
        `;
        control.onAdd = () => container;
        map.addControl(control);
        return () => map.removeControl(control);
    }, [map]);
    return null;
}

// ─── Colored segments renderer ────────────────────────────────────────────────

const ColoredRoute = ({ segments, routeKey }) => {
    if (!segments?.length) return null;
    return (
        <>
            {segments.map((seg, i) => (
                <GeoJSON
                    key={`${routeKey}-seg-${i}`}
                    data={seg}
                    style={{
                        color:   seg.properties?.color ?? '#6366f1',
                        weight:  7,
                        opacity: 0.88,
                        lineCap: 'round',
                        lineJoin:'round',
                    }}
                />
            ))}
        </>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const NavigationView = ({ userLocation: initialLocation, hospital, onClose }) => {

    const [routeData,       setRouteData]       = useState(null);
    const [routeKey,        setRouteKey]        = useState(0);
    const [isLoading,       setIsLoading]       = useState(true);
    const [routingMethod,   setRoutingMethod]   = useState(null);
    const [livePosition,    setLivePosition]    = useState(initialLocation);
    const [isRerouting,     setIsRerouting]     = useState(false);
    const [rerouteCount,    setRerouteCount]    = useState(0);
    const [positionHistory, setPositionHistory] = useState([initialLocation]);

    const routeGeoJSONRef = useRef(null);
    const watchIdRef      = useRef(null);
    const lastRerouteRef  = useRef(0);

    const { speak, stop, toggle, isSpeaking, enabled } = useTTS();

    // ── Route fetcher ─────────────────────────────────────────────────────────

    const fetchRoute = useCallback(async (fromLoc, showLoading = true) => {
        if (!fromLoc || !hospital) return;
        const toLat = parseFloat(hospital.lat);
        const toLon = parseFloat(hospital.lon);
        if (isNaN(toLat) || isNaN(toLon)) return;

        if (showLoading) setIsLoading(true);
        else             setIsRerouting(true);

        try {
            // Layer 1: ORS
            const orsData = await getOrsRoute(fromLoc[0], fromLoc[1], toLat, toLon);
            if (orsData?.geometry) {
                routeGeoJSONRef.current = orsData.geometry;
                setRouteData(orsData);
                setRoutingMethod('ors');
                setRouteKey(k => k + 1);
                if (showLoading) {
                    const t = orsData.total_time_minutes;
                    const d = orsData.total_distance_m ? (orsData.total_distance_m/1000).toFixed(1) : '?';
                    speak(`Route ready. ${t} minutes, ${d} kilometres to ${hospital?.hospital_name || hospital?.name || 'destination'}.`);
                } else {
                    speak('Route recalculated.');
                }
                return;
            }

            // Layer 2: Bidirectional A* (server-side pgRouting)
            const pgData = await getRouteGeometry(fromLoc[0], fromLoc[1], toLat, toLon);
            if (pgData?.geometry) {
                routeGeoJSONRef.current = pgData.geometry;
                setRouteData(pgData);
                setRoutingMethod(pgData.routing_method ?? 'bdAstar_time');
                setRouteKey(k => k + 1);
                if (showLoading) {
                    speak(`Route ready. Approximately ${pgData.total_time_minutes} minutes to ${hospital?.hospital_name || hospital?.name || 'destination'}.`);
                }
                return;
            }

            // Layer 3: OSRM
            setRoutingMethod('osrm');
            if (showLoading) speak('Using standard routing. Follow the path on the map.');

        } catch (err) {
            console.error('[Nav] route error:', err);
            setRoutingMethod('osrm');
        } finally {
            setIsLoading(false);
            setIsRerouting(false);
        }
    }, [hospital, speak]);

    useEffect(() => { fetchRoute(initialLocation, true); }, [fetchRoute]); // eslint-disable-line

    // ── Auto-announce next turn when within 200m ──────────────────────────────
    const lastAnnouncedStep = useRef(-1);
    useEffect(() => {
        if (!routeData?.steps?.length || !livePosition || routingMethod !== 'ors') return;
        const steps = routeData.steps.filter(s => s.distance_m > 2);
        // Find next unannounced step with instruction
        steps.forEach((step, i) => {
            if (i <= lastAnnouncedStep.current) return;
            if (!step.instruction) return;
            // Announce when within ~200m of this step's waypoint (approximate by cumulative distance)
            const cumDist = steps.slice(0, i).reduce((s, st) => s + (st.distance_m ?? 0), 0);
            if (cumDist < 300 && i > 0) {
                lastAnnouncedStep.current = i;
                speak(step.instruction);
            }
        });
    }, [livePosition, routeData, routingMethod, speak]);

    // ── Live GPS ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const newLoc = [pos.coords.latitude, pos.coords.longitude];
                setLivePosition(newLoc);
                setPositionHistory(prev => [...prev.slice(-50), newLoc]);

                if (!routeGeoJSONRef.current) return;
                const now = Date.now();
                if (now - lastRerouteRef.current < 15000) return;

                const dist = distanceFromRouteM(newLoc, routeGeoJSONRef.current);
                if (dist > REROUTE_THRESHOLD_M) {
                    lastRerouteRef.current = now;
                    setRerouteCount(c => c + 1);
                    fetchRoute(newLoc, false);
                }
            },
            err => console.warn('[Nav] GPS:', err.message),
            { enableHighAccuracy: true, maximumAge: GPS_INTERVAL_MS, timeout: 10000 }
        );
        return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); };
    }, [fetchRoute]);

    // ── Icons ─────────────────────────────────────────────────────────────────

    const userIcon = new L.DivIcon({
        html: `<div style="width:16px;height:16px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.35);"></div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    });

    const destSvg = `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"><path d="M50,0 C22.4,0 0,22.4 0,50 C0,77.6 50,120 50,120 C50,120 100,77.6 100,50 C100,22.4 77.6,0 50,0 Z" fill="#ec4899"/><path d="M50,25 L50,75 M25,50 L75,50" stroke="white" stroke-width="12" stroke-linecap="round"/></svg>`;
    const destIcon = new L.Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(destSvg)))}`,
        iconSize: [32, 38], iconAnchor: [16, 38], popupAnchor: [0, -38],
    });

    // ── Derived ───────────────────────────────────────────────────────────────

    const distKm  = routeData?.total_distance_m
        ? (routeData.total_distance_m / 1000).toFixed(1)
        : hospital?.route_distance_meters
        ? (hospital.route_distance_meters / 1000).toFixed(1)
        : '—';

    const timeMin = routeData?.total_time_minutes ?? hospital?.travel_time_minutes ?? '—';
    const isOrs   = routingMethod === 'ors';
    const steps   = (routeData?.steps ?? []).filter(s => s.distance_m > 2);
    const hasSteps = steps.length > 0;

    // ── Routing method display ────────────────────────────────────────────────

    const METHOD_INFO = {
        'ors':            { label: '🌐 ORS',             sub: 'Speed & terrain aware',           color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        'bdAstar_time':   { label: '⚡ Bidir A★',        sub: 'Bidirectional A* · speed cost',   color: 'text-indigo-700 bg-indigo-50 border-indigo-200'   },
        'bdAstar_dist':   { label: '⚡ Bidir A★',        sub: 'Bidirectional A* · distance',      color: 'text-indigo-700 bg-indigo-50 border-indigo-200'   },
        'ch_bdAstar':     { label: '🚀 CH + A★',         sub: 'Contraction Hierarchies · fastest',color: 'text-purple-700 bg-purple-50 border-purple-200'   },
        'ch_offline':     { label: '📦 CH Offline',      sub: 'Client-side graph routing',        color: 'text-orange-700 bg-orange-50 border-orange-200'   },
        'dijkstra_time':  { label: '🔷 Dijkstra',        sub: 'Speed-based',                      color: 'text-blue-700 bg-blue-50 border-blue-200'         },
        'dijkstra_dist':  { label: '🔷 Dijkstra',        sub: 'Distance-based',                   color: 'text-blue-700 bg-blue-50 border-blue-200'         },
        'time_based':     { label: '⚡ Bidir A★',        sub: 'Speed-based routing',              color: 'text-indigo-700 bg-indigo-50 border-indigo-200'   },
        'distance_based': { label: '⚡ Bidir A★',        sub: 'Distance-based routing',           color: 'text-indigo-700 bg-indigo-50 border-indigo-200'   },
        'pgrouting':      { label: '⚡ Bidir A★',        sub: 'Speed-based routing',              color: 'text-indigo-700 bg-indigo-50 border-indigo-200'   },
        'osrm':           { label: '📍 OSRM',            sub: 'Standard road routing',            color: 'text-amber-700 bg-amber-50 border-amber-200'      },
        'cached':         { label: '📦 Cached',          sub: 'Stored from last session',         color: 'text-green-700 bg-green-50 border-green-200'      },
    };

    const mi         = METHOD_INFO[routingMethod] ?? { label: '⌛ Calculating…', sub: '', color: 'text-slate-500 bg-slate-50 border-slate-200' };
    const methodLabel = mi.label;
    const methodSub   = mi.sub;
    const methodColor = mi.color;

    // ── JSX ───────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col md:flex-row-reverse">

            {/* ════ Sidebar ════ */}
            <div className="w-full md:w-96 bg-white shadow-xl z-10 flex flex-col h-[45%] md:h-full">

                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-start p-4 border-b">
                    <div className="min-w-0 pr-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Navigating to</p>
                        <h2 className="text-base font-bold text-slate-800 leading-tight truncate">
                            {hospital.hospital_name || hospital.name}
                        </h2>
                        <p className="text-xs text-slate-500 truncate">{hospital.address}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 flex-shrink-0">
                        <X size={20} />
                    </button>
                    <button
                        onClick={toggle}
                        title={enabled ? 'Mute voice guidance' : 'Enable voice guidance'}
                        className={`p-2 rounded-full flex-shrink-0 transition-colors ${enabled ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-100'}`}
                    >
                        {enabled
                            ? <Volume2 size={20} className={isSpeaking ? 'animate-pulse' : ''} />
                            : <VolumeX size={20} />
                        }
                    </button>
                </div>

                {/* Stats */}
                {!isLoading && routeData && (
                    <div className="flex-shrink-0 p-4 border-b space-y-2">
                        <div className="flex items-end gap-6">
                            <div>
                                <p className="text-3xl font-black text-indigo-700 leading-none">{timeMin}</p>
                                <p className="text-xs text-slate-500 mt-0.5">minutes</p>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-slate-700 leading-none">{distKm}</p>
                                <p className="text-xs text-slate-500 mt-0.5">km</p>
                            </div>
                            {isOrs && routeData.ascent_m > 20 && (
                                <div>
                                    <p className="text-xl font-black text-amber-600 leading-none flex items-center gap-1">
                                        <Mountain size={15} /> {routeData.ascent_m}m
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">elevation</p>
                                </div>
                            )}
                        </div>

                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${methodColor}`}>
                            {methodLabel}
                            {methodSub && <span className="font-normal opacity-75">· {methodSub}</span>}
                        </span>

                        {isOrs && routeData.has_unpaved_roads && (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>Route includes unpaved/dirt roads. Suitable vehicle advised.</span>
                            </div>
                        )}

                        {isOrs && routeData.surface_breakdown?.length > 0 && (
                            <SurfaceBar breakdown={routeData.surface_breakdown} />
                        )}

                        {rerouteCount > 0 && (
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                                <RefreshCw size={10} /> Recalculated {rerouteCount}×
                            </p>
                        )}
                    </div>
                )}

                {/* Loading */}
                {(isLoading || isRerouting) && (
                    <div className="flex-shrink-0 p-4 border-b flex items-center gap-2 text-sm text-indigo-600">
                        <RefreshCw size={15} className="animate-spin" />
                        {isRerouting ? 'Recalculating route…' : 'Calculating fastest route…'}
                    </div>
                )}

                {/* Turn-by-turn steps */}
                {hasSteps && (
                    <div className="flex-grow overflow-y-auto">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-1">
                            Turn-by-Turn · {steps.length} steps
                            {isOrs && <span className="ml-1 text-emerald-500">· ORS</span>}
                            {['bdAstar_time','bdAstar_dist','time_based','distance_based','pgrouting','ch_bdAstar','ch_offline'].includes(routingMethod) && <span className="ml-1 text-indigo-400">· A★ Routing</span>}
                        </p>
                        <ul className="px-1 pb-4 space-y-px">
                            {steps.map((step, i) => (
                                <StepCard key={i} step={step} index={i} isOrs={isOrs} />
                            ))}
                        </ul>
                    </div>
                )}

                {!isLoading && !hasSteps && routingMethod === 'osrm' && (
                    <div className="flex-grow p-4 text-center text-xs text-slate-400">
                        Turn-by-turn available with ORS or A★ routing.
                    </div>
                )}

                {!isLoading && !hasSteps && routingMethod !== 'osrm' && (
                    <div className="flex-grow p-4 text-center text-xs text-slate-400">
                        No step data returned. Route is shown on the map.
                    </div>
                )}
            </div>

            {/* ════ Map ════ */}
            <div className="flex-grow h-[55%] md:h-full relative">
                <MapContainer center={initialLocation} zoom={13} style={{ height:'100%', width:'100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />

                    {/* Auto-fit */}
                    {routeData?.geometry && <FitRoute key={routeKey} geoJSON={routeData.geometry} />}

                    {/* Breadcrumb trail */}
                    {positionHistory.length > 1 && (
                        <Polyline
                            positions={positionHistory}
                            pathOptions={{ color:'#3b82f6', weight:3, opacity:0.4, dashArray:'6 4' }}
                        />
                    )}

                    {/* User marker */}
                    <Marker position={livePosition} icon={userIcon}>
                        <Popup><strong>Your Location</strong></Popup>
                    </Marker>

                    {/* Destination marker */}
                    {hospital?.lat && hospital?.lon && (
                        <Marker position={[parseFloat(hospital.lat), parseFloat(hospital.lon)]} icon={destIcon}>
                            <Popup>
                                <strong>{hospital.hospital_name || hospital.name}</strong><br />
                                {hospital.address}
                            </Popup>
                        </Marker>
                    )}

                    {/* ORS colored segments with tooltips */}
                    {isOrs && routeData?.colored_segments?.length > 0 && (
                        <>
                            {routeData.colored_segments.map((seg, i) => {
                                const p = seg.properties ?? {};
                                const timeMin = p.time_s ? Math.max(1, Math.round(p.time_s / 60)) : null;
                                const dist    = p.distance_m >= 1000 ? `${(p.distance_m / 1000).toFixed(1)} km` : `${p.distance_m} m`;
                                const tip     = [
                                    p.road && p.road !== 'Unnamed road' ? p.road : null,
                                    timeMin ? `~${timeMin} min` : null,
                                    dist,
                                    p.speed_kmh ? `${p.speed_kmh} km/h` : null,
                                    p.label,
                                ].filter(Boolean).join(' · ');
                                return (
                                    <GeoJSON
                                        key={`nav-seg-${routeKey}-${i}`}
                                        data={seg}
                                        style={{ color: p.color ?? '#16a34a', weight: 7, opacity: 0.88, lineCap: 'round' }}
                                        onEachFeature={(_, layer) => tip && layer.bindTooltip(tip, { sticky: true, className: 'hospital-label' })}
                                    />
                                );
                            })}
                        </>
                    )}

                    {/* A★/pgR single-color route */}
                    {['bdAstar_time','bdAstar_dist','time_based','distance_based','pgrouting','dijkstra_time','dijkstra_dist','ch_bdAstar','ch_offline'].includes(routingMethod) && routeData?.geometry && (
                        <GeoJSON
                            key={routeKey}
                            data={routeData.geometry}
                            style={{ color: '#6366f1', weight: 6, opacity: 0.85 }}
                        />
                    )}

                    {/* OSRM fallback */}
                    {routingMethod === 'osrm' && hospital?.lat && hospital?.lon && (
                        <RoutingMachine
                            start={livePosition}
                            end={[parseFloat(hospital.lat), parseFloat(hospital.lon)]}
                        />
                    )}
                </MapContainer>

                {/* Rerouting overlay */}
                {isRerouting && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold text-indigo-700 border border-indigo-200">
                        <RefreshCw size={15} className="animate-spin" /> Recalculating…
                    </div>
                )}
            </div>
        </div>
    );
};

export default NavigationView;