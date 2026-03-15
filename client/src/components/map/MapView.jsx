
import React, { useEffect, useState } from 'react';
import {
    MapContainer, TileLayer, Marker, Popup,
    useMap, Tooltip, GeoJSON, Circle,
} from 'react-leaflet';
import L from 'leaflet';
import RoutingMachine    from './RoutingMachine';
import HighlightedMarker from './HighlightedMarker';
import { getRouteGeometry } from '../../services/apiService';
import { COMPARE_COLORS } from '../panels/ComparePanel';

// ─────────────────────────────────────────────
//  Compare routes layer — one coloured route per hospital
// ─────────────────────────────────────────────

const CompareRoutesLayer = ({ userLocation, hospitals }) => {
    const [routes, setRoutes] = useState([]); // [{ geoJSON, color, name }]
    const map = useMap();

    useEffect(() => {
        if (!userLocation || !hospitals?.length) {
            setRoutes([]);
            return;
        }

        let live = true;
        setRoutes([]);

        const fetchAll = async () => {
            const results = await Promise.allSettled(
                hospitals
                    .filter(h => {
                        const lat = parseFloat(h.lat);
                        const lon = parseFloat(h.lon);
                        return !isNaN(lat) && !isNaN(lon);
                    })
                    .map((h, i) => {
                        const lat = parseFloat(h.lat);
                        const lon = parseFloat(h.lon);
                        return getRouteGeometry(
                            userLocation[0], userLocation[1],
                            lat, lon
                        ).then(geoJSON => ({
                            geoJSON,
                            color: COMPARE_COLORS[i % COMPARE_COLORS.length],
                            name:  h.name || h.hospital_name,
                        }));
                    })
            );

            if (!live) return;

            const valid = results
                .filter(r => r.status === 'fulfilled' && r.value.geoJSON)
                .map(r => r.value);

            setRoutes(valid);

            // Fit map to show all routes
            if (valid.length > 0) {
                try {
                    const allCoords = [];
                    valid.forEach(({ geoJSON }) => {
                        const layer = L.geoJSON(geoJSON);
                        if (layer.getBounds().isValid()) {
                            allCoords.push(...Object.values(layer.getBounds()));
                        }
                    });
                    if (userLocation) allCoords.push(L.latLng(userLocation[0], userLocation[1]));
                    hospitals.forEach(h => {
                        if (h.lat != null && h.lon != null) {
                            allCoords.push(L.latLng(parseFloat(h.lat), parseFloat(h.lon)));
                        }
                    });
                    const bounds = L.latLngBounds(allCoords);
                    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60] });
                } catch (_) {}
            }
        };

        fetchAll();
        return () => { live = false; };
    }, [userLocation, hospitals, map]);

    return (
        <>
            {routes.map(({ geoJSON, color, name }, i) => (
                <GeoJSON
                    key={`compare-route-${i}`}
                    data={geoJSON}
                    style={{ color, weight: 5, opacity: 0.85 }}
                />
            ))}
        </>
    );
};

// ─────────────────────────────────────────────
//  Icon factories
// ─────────────────────────────────────────────

const userIcon = new L.DivIcon({
    html: `<div class="w-full h-full bg-blue-500 rounded-full border-2 border-white shadow-md"></div>`,
    className: 'leaflet-user-icon',
    iconSize: [16, 16],
});

/** Generate a coloured hospital pin SVG icon. */
const createHospitalIcon = (color = '#dc2626') => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M50,0 C22.4,0 0,22.4 0,50 C0,77.6 50,100 50,100 C50,100 100,77.6 100,50 C100,22.4 77.6,0 50,0 Z" fill="${color}"/>
        <path d="M50,25 L50,75 M25,50 L75,50" stroke="white" stroke-width="12" stroke-linecap="round"/>
    </svg>`;
    return new L.Icon({
        iconUrl:      `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
        iconSize:     [32, 32],
        iconAnchor:   [16, 32],
        popupAnchor:  [0, -32],
    });
};

/** Numbered Pareto pin — rank shown inside */
const createRankedIcon = (rank, isTop) => {
    const bg   = isTop ? '#4f46e5' : '#6366f1';
    const size = isTop ? 44 : 36;
    // Use SVG polygon for star instead of unicode character (btoa can't encode unicode)
    const starPolygon = isTop
        ? `<polygon points="50,15 57,35 78,35 62,48 68,68 50,56 32,68 38,48 22,35 43,35" fill="#fbbf24"/>`
        : '';
    const textY = isTop ? 88 : 72;
    const svg = `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
        <path d="M50,0 C22.4,0 0,22.4 0,50 C0,77.6 50,120 50,120 C50,120 100,77.6 100,50 C100,22.4 77.6,0 50,0 Z" fill="${bg}"/>
        ${starPolygon}
        <text x="50" y="${textY}" text-anchor="middle" font-size="38" font-weight="bold" fill="white" font-family="Arial,sans-serif">${rank}</text>
    </svg>`;
    return new L.Icon({
        iconUrl:      `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
        iconSize:     [size, size * 1.2],
        iconAnchor:   [size / 2, size * 1.2],
        popupAnchor:  [0, -(size * 1.2)],
    });
};

// Pre-build load-status icon variants
const iconByLoad = {
    green:   createHospitalIcon('#16a34a'),
    yellow:  createHospitalIcon('#d97706'),
    red:     createHospitalIcon('#dc2626'),
    default: createHospitalIcon('#dc2626'),
};

const getIcon = (h, loadStatusMap) => {
    if (h?.isTopChoice)             return createRankedIcon(1, true);
    if (h?.isPareto && h?.paretoRank) return createRankedIcon(h.paretoRank, false);
    const entry = loadStatusMap?.get(h?.hospital_id);
    return iconByLoad[entry?.load_status] ?? iconByLoad.default;
};


// ─────────────────────────────────────────────
//  Map-view auto-fit controller
// ─────────────────────────────────────────────

function MapViewController({ hospitals, selectedHospital, userLocation, routingMode }) {
    const map = useMap();
    useEffect(() => {
        if (selectedHospital) return;
        if (hospitals?.length > 0) {
            const bounds = L.latLngBounds(hospitals.map(h => [h.lat, h.lon]));
            if (userLocation) bounds.extend(userLocation);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [hospitals, selectedHospital, userLocation, routingMode, map]);
    return null;
}


// ─────────────────────────────────────────────
//  pgRouting GeoJSON layer
// ─────────────────────────────────────────────

const PgRoutingLayer = ({ userLocation, hospital }) => {
    const [routeGeoJSON, setRouteGeoJSON] = useState(null);
    const map = useMap();

    useEffect(() => {
        if (!userLocation || !hospital) { setRouteGeoJSON(null); return; }
        let live = true;
        getRouteGeometry(userLocation[0], userLocation[1], hospital.lat, hospital.lon)
            .then(data => {
                if (!live || !data) return;
                setRouteGeoJSON(data);
                const bounds = L.geoJSON(data).getBounds();
                if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
            })
            .catch(() => { if (live) setRouteGeoJSON(null); });
        return () => { live = false; };
    }, [userLocation, hospital, map]);

    if (!routeGeoJSON) return null;
    return <GeoJSON data={routeGeoJSON} style={{ color: '#ec4899', weight: 6, opacity: 0.8 }} />;
};


// ─────────────────────────────────────────────
//  Routing-mode toggle control (bottom-right)
// ─────────────────────────────────────────────

function RoutingToggleControl({ routingMode, setRoutingMode }) {
    const map = useMap();

    useEffect(() => {
        const control   = L.control({ position: 'bottomright' });
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        container.style.cssText =
            'background:white;padding:8px 20px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.2);cursor:pointer;margin-bottom:3rem;';

        const mapPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
        const dbSvg     = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;

        const update = (mode) => {
            container.innerHTML = `<div style="display:flex;align-items:center;gap:8px;" class="text-sm font-semibold text-slate-700" title="${mode === 'osrm' ? 'Frontend Routing (OSRM)' : 'Backend Routing (pgRouting)'}">
                ${mode === 'osrm' ? mapPinSvg : dbSvg}
                <span>${mode === 'osrm' ? 'OSRM' : 'pgRouting'}</span>
            </div>`;
        };
        update(routingMode);

        L.DomEvent.on(container, 'click', (e) => {
            e.stopPropagation();
            setRoutingMode(cur => {
                const next = cur === 'osrm' ? 'pgrouting' : 'osrm';
                update(next);
                return next;
            });
        });
        L.DomEvent.disableClickPropagation(container);
        control.onAdd = () => container;
        map.addControl(control);
        return () => map.removeControl(control);
    }, [map, routingMode, setRoutingMode]);

    return null;
}


// ─────────────────────────────────────────────
//  Load-status legend (top-right)
// ─────────────────────────────────────────────

function LoadLegendControl() {
    const map = useMap();
    useEffect(() => {
        const control   = L.control({ position: 'topright' });
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        container.style.cssText =
            'background:white;padding:8px 12px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);pointer-events:none;font-size:11px;';
        container.innerHTML = `
            <div style="font-weight:600;color:#475569;margin-bottom:4px;">Bed Availability</div>
            ${[['#16a34a','Available (>40%)'],['#d97706','Moderate (15-40%)'],['#dc2626','Crowded (<15%)']].map(
                ([c, l]) => `<div style="display:flex;align-items:center;gap:6px;color:#475569;margin-top:2px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block;flex-shrink:0;"></span>${l}
                </div>`
            ).join('')}
        `;
        control.onAdd = () => container;
        map.addControl(control);
        return () => map.removeControl(control);
    }, [map]);
    return null;
}


// ─────────────────────────────────────────────
//  Main MapView
// ─────────────────────────────────────────────

function MapView({
    userLocation,
    hospitals,          // raw searchResults (for fallback)
    annotatedHospitals, // hospitals with isPareto / isTopChoice flags
    hospital,
    onMarkerClick,
    searchType,
    radiusKm,
    routingMode,
    setRoutingMode,
    loadStatusMap,
    compareHospitals = [],
}) {
    const isSpecialtySearch = searchType === 'specialty';

    // When compare panel is open, suppress normal hospital markers entirely
    const isCompareActive = compareHospitals.length >= 2;

    const renderPopup = (h) => (
        <div>
            <strong className="text-base">{h.hospital_name || h.name}</strong><br />
            {h.address}<br />
            <hr className="my-1" />
            <strong>Est. Time:</strong> {Math.round(h.travel_time_minutes)} min drive<br />
            <strong>Distance:</strong> {((h.route_distance_meters ?? 0) / 1000).toFixed(1)} km
        </div>
    );

    return (
        <MapContainer
            center={userLocation || [22.34, 87.31]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap"
            />

            <MapViewController
                hospitals={hospitals}
                selectedHospital={hospital}
                userLocation={userLocation}
                routingMode={routingMode}
            />

            <RoutingToggleControl routingMode={routingMode} setRoutingMode={setRoutingMode} />

            {/* Only show the load legend when we actually have data */}
            {loadStatusMap?.size > 0 && <LoadLegendControl />}

            {/* User location marker */}
            {userLocation && (
                <Marker position={userLocation} icon={userIcon}>
                    <Popup><strong>Your Location</strong></Popup>
                </Marker>
            )}

            {/* Radius circle */}
            {radiusKm && userLocation && (
                <Circle
                    center={userLocation}
                    radius={parseFloat(radiusKm) * 1000}
                    pathOptions={{
                        color: '#3b82f6',
                        fillColor: '#bfdbfe',
                        fillOpacity: 0.1,
                        dashArray: '5, 10',
                        weight: 2,
                    }}
                />
            )}

            {/* ── Compare mode: multi-coloured routes + markers ── */}
            {compareHospitals.length >= 2 && userLocation && (
                <>
                    <CompareRoutesLayer
                        userLocation={userLocation}
                        hospitals={compareHospitals}
                    />
                    {compareHospitals.map((h, i) => {
                        if (h.lat == null || h.lon == null) return null;
                        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
                        const svgPin = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50,0 C22.4,0 0,22.4 0,50 C0,77.6 50,100 50,100 C50,100 100,77.6 100,50 C100,22.4 77.6,0 50,0 Z" fill="${color}"/>
                            <circle cx="50" cy="50" r="20" fill="white"/>
                            <text x="50" y="64" text-anchor="middle" font-size="40" font-weight="bold" fill="${color}" font-family="Arial,sans-serif">${i + 1}</text>
                        </svg>`;
                        const icon = new L.Icon({
                            iconUrl:    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgPin)))}`,
                            iconSize:   [36, 36],
                            iconAnchor: [18, 36],
                            popupAnchor:[0, -36],
                        });
                        return (
                            <Marker
                                key={`compare-marker-${h.hospital_id}`}
                                position={[parseFloat(h.lat), parseFloat(h.lon)]}
                                icon={icon}
                            >
                                <Tooltip permanent direction="top" offset={[0, -36]} className="hospital-label">
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: color }}
                                            />
                                            <span className="font-bold">{h.name || h.hospital_name}</span>
                                        </div>
                                        {h.distance_km != null && (
                                            <div className="text-xs mt-0.5">
                                                ~{h.travel_time_minutes} min · {h.distance_km} km
                                            </div>
                                        )}
                                    </div>
                                </Tooltip>
                            </Marker>
                        );
                    })}
                </>
            )}

            {/* Hospital markers — hidden when compare panel is open */}
            {!isCompareActive && (annotatedHospitals?.length ? annotatedHospitals : hospitals).map(h => {
                if (h.lat == null || h.lon == null ||
                    isNaN(parseFloat(h.lat)) || isNaN(parseFloat(h.lon))) return null;

                if (isSpecialtySearch && h.matching_doctors) {
                    return (
                        <HighlightedMarker
                            key={`highlight-${h.hospital_id}`}
                            hospital={h}
                            onClick={onMarkerClick}
                        />
                    );
                }

                if (!hospital) {
                    const icon     = getIcon(h, loadStatusMap);
                    const isTop    = h.isTopChoice;
                    const isPareto = h.isPareto;
                    const rank     = h.paretoRank;
                    return (
                        <Marker
                            key={h.hospital_id}
                            position={[parseFloat(h.lat), parseFloat(h.lon)]}
                            icon={icon}
                            zIndexOffset={isTop ? 1000 : isPareto ? 500 : 0}
                            eventHandlers={{ click: () => onMarkerClick(h.hospital_id) }}
                        >
                            <Tooltip permanent direction="top" offset={[0, isTop ? -52 : -32]} className="hospital-label">
                                <div>
                                    {isTop && (
                                        <div className="text-[10px] font-black text-indigo-600 mb-0.5">
                                            ★ #1 Best Match ({h.paretoScore}/100)
                                        </div>
                                    )}
                                    {isPareto && !isTop && rank && (
                                        <div className="text-[10px] font-bold text-indigo-500 mb-0.5">
                                            ◆ Pareto #{rank} ({h.paretoScore}/100)
                                        </div>
                                    )}
                                    <div className="font-bold">{h.hospital_name}</div>
                                    <div className="text-xs">
                                        ~{Math.round(h.travel_time_minutes)} min /&nbsp;
                                        {((h.route_distance_meters ?? 0) / 1000).toFixed(1)} km
                                    </div>
                                </div>
                            </Tooltip>
                        </Marker>
                    );
                }
                return null;
            })}

            {/* Selected hospital + routing */}
            {hospital && userLocation &&
             hospital.lat != null && hospital.lon != null &&
             !isNaN(parseFloat(hospital.lat)) && !isNaN(parseFloat(hospital.lon)) && (
                <>
                    <Marker
                        position={[parseFloat(hospital.lat), parseFloat(hospital.lon)]}
                        icon={getIcon(hospital.hospital_id, loadStatusMap)}
                    >
                        <Tooltip
                            permanent
                            direction="top"
                            offset={[0, -32]}
                            className="hospital-label"
                        >
                            <div>
                                <div className="font-bold">{hospital.hospital_name}</div>
                                <div className="text-xs">
                                    ~{Math.round(hospital.travel_time_minutes)} min /&nbsp;
                                    {((hospital.route_distance_meters ?? 0) / 1000).toFixed(1)} km
                                </div>
                            </div>
                        </Tooltip>
                        <Popup>{renderPopup(hospital)}</Popup>
                    </Marker>

                    {routingMode === 'osrm' ? (
                        <RoutingMachine start={userLocation} end={[parseFloat(hospital.lat), parseFloat(hospital.lon)]} />
                    ) : (
                        <PgRoutingLayer userLocation={userLocation} hospital={hospital} />
                    )}
                </>
            )}
        </MapContainer>
    );
}

export default MapView;