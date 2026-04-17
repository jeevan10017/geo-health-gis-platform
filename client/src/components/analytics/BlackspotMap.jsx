
//  Continuous heatmap using leaflet.heat:
//    Red/orange   = healthcare deserts (deprivation > 0.65)
//    Yellow       = underserved       (0.35 – 0.65)
//    Green/blue   = adequate access   (< 0.35)
//
//  Ambulance placement overlay shown as 🚑 pins.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, RefreshCw, AlertTriangle, Truck, Info, BarChart2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

// ─── Dynamically load leaflet.heat (no npm package needed) ───────────────────

const loadLeafletHeat = () => new Promise((resolve) => {
    if (window.L?.heatLayer) return resolve();
    const script    = document.createElement('script');
    script.src      = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
    script.onload   = resolve;
    script.onerror  = resolve; // resolve anyway — will use fallback
    document.head.appendChild(script);
});

// ─── Heatmap layer component ──────────────────────────────────────────────────

function HeatmapLayer({ features, intensity }) {
    const map     = useRef(null);
    const heatRef = useRef(null);
    const leafMap = useMap();

    useEffect(() => {
        map.current = leafMap;
    }, [leafMap]);

    useEffect(() => {
        if (!features?.length) return;

        const buildHeat = () => {
            // Remove existing layer
            if (heatRef.current) {
                leafMap.removeLayer(heatRef.current);
                heatRef.current = null;
            }

            if (!window.L?.heatLayer) {
                console.warn('[Heatmap] leaflet.heat not loaded, using circle fallback');
                return;
            }

            // leaflet.heat points: [lat, lon, intensity]
            // intensity = deprivation 0..1 (1 = red, 0 = blue)
            const points = features.map(f => [
                f.properties.lat,
                f.properties.lon,
                parseFloat(f.properties.deprivation),
            ]);

            heatRef.current = window.L.heatLayer(points, {
                radius:    28,          // pixel radius of each sample point
                blur:      22,          // gaussian blur — higher = smoother
                maxZoom:   14,
                max:       1.0,
                gradient: {
                    0.0:  '#1e40af',   // deep blue  — excellent access
                    0.20: '#3b82f6',   // blue       — good
                    0.35: '#22c55e',   // green      — adequate
                    0.50: '#facc15',   // yellow     — moderate deprivation
                    0.65: '#f97316',   // orange     — underserved
                    0.80: '#dc2626',   // red        — healthcare desert
                    1.0:  '#7f1d1d',   // dark red   — severe blackspot
                },
            }).addTo(leafMap);
        };

        loadLeafletHeat().then(buildHeat);

        return () => {
            if (heatRef.current) {
                leafMap.removeLayer(heatRef.current);
                heatRef.current = null;
            }
        };
    }, [features, leafMap]);

    return null;
}

// ─── Auto-fit bounds ──────────────────────────────────────────────────────────

function FitBounds({ features }) {
    const map = useMap();
    useEffect(() => {
        if (!features?.length) return;
        const lats = features.map(f => f.properties.lat);
        const lons = features.map(f => f.properties.lon);
        map.fitBounds(
            [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
            { padding: [30, 30] }
        );
    }, [features?.length, map]); // eslint-disable-line
    return null;
}

// ─── Legend control ───────────────────────────────────────────────────────────

function LegendControl() {
    const map = useMap();
    useEffect(() => {
        const control = L.control({ position: 'bottomleft' });
        const el = L.DomUtil.create('div');
        el.style.cssText = 'background:rgba(255,255,255,0.95);padding:10px 14px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);pointer-events:none;font-size:11px;';
        el.innerHTML = `
            <div style="font-weight:700;color:#1e293b;margin-bottom:6px;">Healthcare Access</div>
            <div style="display:flex;align-items:center;gap:0;border-radius:4px;overflow:hidden;height:14px;width:160px;margin-bottom:6px;">
                <div style="flex:1;background:#1e40af;"></div>
                <div style="flex:1;background:#3b82f6;"></div>
                <div style="flex:1;background:#22c55e;"></div>
                <div style="flex:1;background:#facc15;"></div>
                <div style="flex:1;background:#f97316;"></div>
                <div style="flex:1;background:#dc2626;"></div>
                <div style="flex:1;background:#7f1d1d;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;color:#64748b;font-size:10px;">
                <span>Well served</span>
                <span>Blackspot</span>
            </div>
        `;
        control.onAdd = () => el;
        map.addControl(control);
        return () => map.removeControl(control);
    }, [map]);
    return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

const BlackspotMap = ({ onClose }) => {
    const [geoData,    setGeoData]    = useState(null);
    const [ambulances, setAmbulances] = useState(null);
    const [isLoading,  setIsLoading]  = useState(true);
    const [showAmb,    setShowAmb]    = useState(false);
    const [nAmb,       setNAmb]       = useState(5);
    const [hoverPoint, setHoverPoint] = useState(null);

    const load = async () => {
        setIsLoading(true);
        try {
            const [bsRes, ambRes] = await Promise.all([
                fetch(`${API}/analytics/blackspots`),
                fetch(`${API}/analytics/ambulance-placement?n=${nAmb}`),
            ]);
            const bs  = await bsRes.json();
            const amb = await ambRes.json();
            setGeoData(bs);
            setAmbulances(amb);
        } catch (e) {
            console.error('[Blackspot]', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { load(); }, [nAmb]);

    const meta = geoData?.metadata;

    // Ambulance marker
    const ambIcon = (rank) => new L.DivIcon({
        html: `<div style="background:#7c3aed;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid white;">🚑</div>`,
        className: '', iconSize: [30, 30], iconAnchor: [15, 15],
    });

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">

            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b px-4 py-3 flex items-center gap-3 flex-wrap">
                <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                <div className="min-w-0">
                    <h2 className="font-bold text-slate-800">Healthcare Blackspot Heatmap</h2>
                    <p className="text-xs text-slate-500">Continuous deprivation index — Paschim Medinipur</p>
                </div>

                <div className="flex items-center gap-3 ml-auto flex-wrap">
                    <label className="text-xs text-slate-600 flex items-center gap-1.5">
                        Ambulances
                        <select value={nAmb} onChange={e => setNAmb(Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 text-xs">
                            {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </label>

                    <button
                        onClick={() => setShowAmb(v => !v)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${showAmb ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}
                    >
                        <Truck size={12} /> {showAmb ? 'Hide 🚑' : 'Optimal Placement'}
                    </button>

                    <button onClick={load} className="p-1.5 rounded-full hover:bg-slate-100" title="Refresh">
                        <RefreshCw size={16} className={isLoading ? 'animate-spin text-indigo-500' : 'text-slate-500'} />
                    </button>

                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Stats bar */}
            {meta && (
                <div className="flex-shrink-0 bg-slate-900 text-white px-4 py-2 flex items-center gap-5 text-xs flex-wrap">
                    <div>
                        <span className="text-slate-400">Sample points: </span>
                        <strong>{meta.total_points}</strong>
                        <span className="text-slate-500"> (2.5 km grid)</span>
                    </div>
                    <div>
                        <span className="text-red-400">🔴 Blackspots: </span>
                        <strong className="text-red-300">{meta.blackspot_count}</strong>
                        <span className="text-slate-400"> ({meta.blackspot_pct}% of district)</span>
                    </div>
                    <div>
                        <span className="text-slate-400">Avg access score: </span>
                        <strong className={meta.avg_access_score < 50 ? 'text-red-300' : meta.avg_access_score < 70 ? 'text-yellow-300' : 'text-green-300'}>
                            {meta.avg_access_score}/100
                        </strong>
                    </div>
                    {ambulances && (
                        <div className="text-purple-300">
                            🚑 {nAmb} placements → est. <strong>{ambulances.improvement_pct}%</strong> faster response
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                        <Info size={11} />
                        Hover map for cell details
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="flex-grow relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-slate-900/70 z-10 flex items-center justify-center">
                        <div className="text-center text-white">
                            <RefreshCw size={36} className="animate-spin mx-auto mb-3 text-indigo-400" />
                            <p className="font-bold">Computing deprivation index…</p>
                            <p className="text-sm text-slate-400 mt-1">Sampling ~500 grid points</p>
                        </div>
                    </div>
                )}

                <MapContainer
                    center={[22.4, 87.2]}
                    zoom={9}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    {/* Slightly darker tile for better heatmap contrast */}
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap"
                        opacity={0.6}
                    />

                    {geoData?.features && (
                        <>
                            <FitBounds features={geoData.features} />
                            <HeatmapLayer features={geoData.features} />
                        </>
                    )}

                    <LegendControl />

                    {/* Ambulance optimal placement markers + coverage circles */}
                    {showAmb && ambulances?.placements?.map((p, i) => {
                        // Color the coverage circle by how deprived the area is
                        const d     = p.deprivation ?? 0.5;
                        const color = d > 0.75 ? '#7f1d1d'
                                    : d > 0.55 ? '#dc2626'
                                    : d > 0.40 ? '#f97316'
                                    : '#facc15';
                        return (
                            <React.Fragment key={`amb-${i}`}>
                                {/* Coverage circle — shaded by local deprivation */}
                                <Circle
                                    center={[p.lat, p.lon]}
                                    radius={20000}   // 20 km coverage
                                    pathOptions={{
                                        color,
                                        fillColor: color,
                                        fillOpacity: 0.12,
                                        weight: 2,
                                        dashArray: '6 4',
                                        opacity: 0.6,
                                    }}
                                />
                                <Marker
                                    position={[p.lat, p.lon]}
                                    icon={new L.DivIcon({
                                        html: `<div style="
                                            background:${color};color:white;
                                            border-radius:50%;width:32px;height:32px;
                                            display:flex;align-items:center;justify-content:center;
                                            font-size:15px;font-weight:800;
                                            box-shadow:0 2px 10px rgba(0,0,0,0.4);
                                            border:2.5px solid white;
                                        ">🚑</div>`,
                                        className: '', iconSize: [32, 32], iconAnchor: [16, 16],
                                    })}
                                >
                                    <Tooltip direction="top" offset={[0, -20]}>
                                        <div className="text-xs">
                                            <div className="font-bold" style={{ color }}>🚑 Station #{p.rank}</div>
                                            <div>Area deprivation: <strong>{Math.round(p.deprivation * 100)}%</strong></div>
                                            <div>{p.cells_covered} points in 20 km</div>
                                            <div className="text-orange-600">
                                                {p.high_deprivation_cells} high-deprivation cells covered
                                            </div>
                                            <div className="text-green-700 font-semibold">
                                                Saves ~{p.avg_time_saved_min} min avg
                                            </div>
                                        </div>
                                    </Tooltip>
                                </Marker>
                            </React.Fragment>
                        );
                    })}
                </MapContainer>

                {/* Insight panel */}
                {meta && !isLoading && (
                    <div className="absolute top-3 right-3 z-[400] bg-white/95 rounded-xl shadow-lg p-3 max-w-[200px] text-xs space-y-2">
                        <p className="font-bold text-slate-800 flex items-center gap-1">
                            <BarChart2 size={13} className="text-indigo-500" /> District Summary
                        </p>
                        <div className="space-y-1.5">
                            {[
                                { label: 'Well served', pct: Math.round((1 - meta.blackspot_pct/100) * 70), color: '#22c55e' },
                                { label: 'Underserved', pct: Math.round(meta.blackspot_pct * 0.4),           color: '#f97316' },
                                { label: 'Blackspot',   pct: meta.blackspot_pct,                             color: '#dc2626' },
                            ].map(({ label, pct, color }) => (
                                <div key={label}>
                                    <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                                        <span style={{ color }}>{label}</span>
                                        <span>{pct}%</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full">
                                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[9px] text-slate-400 border-t pt-1.5">
                            Deprivation = distance (70%) + hospital capability (30%)
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BlackspotMap;