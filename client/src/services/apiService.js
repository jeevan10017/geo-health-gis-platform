
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// ─────────────────────────────────────────────
//  Shared error handler
// ─────────────────────────────────────────────

const handleApiError = (error, defaultMessage) => {
    console.error(`API Error: ${defaultMessage}`, error);
    throw new Error(error.response?.data?.error || defaultMessage);
};

// ─────────────────────────────────────────────
//  Normalization helper
//  Ensures every hospital object has consistent field names
//  regardless of which endpoint returned it.
// ─────────────────────────────────────────────

const normalizeHospital = (h) => ({
    ...h,
    // Normalize name field
    hospital_name: h.hospital_name || h.name,
    // Normalize distance — some endpoints return distance_km, others route_distance_meters
    route_distance_meters:
        h.route_distance_meters != null
            ? h.route_distance_meters
            : h.distance_km != null
            ? parseFloat(h.distance_km) * 1000
            : null,
    // Normalize travel time — ensure it's a number
    travel_time_minutes:
        h.travel_time_minutes != null ? Number(h.travel_time_minutes) : null,
    // Ensure lat/lon are always present as numbers (decision/emergency endpoints
    // return them as ST_X/ST_Y; guard against undefined to prevent Leaflet crash)
    lat: h.lat != null ? parseFloat(h.lat) : null,
    lon: h.lon != null ? parseFloat(h.lon) : null,
});


// ─────────────────────────────────────────────
//  Core hospital / doctor / routing endpoints
// ─────────────────────────────────────────────

/**
 * GET /api/hospitals
 * Nearby hospitals sorted by road-network distance (pgRouting Dijkstra).
 */
/**
 * GET /api/hospitals/currently-available
 * Hospitals with doctors on-duty RIGHT NOW, Pareto-scored.
 */
export const getCurrentlyAvailable = async (lat, lon) => {
    try {
        const { data } = await axios.get(`${API_URL}/hospitals/currently-available`, {
            params: { lat, lon },
        });
        return data.map(normalizeHospital);
    } catch (error) {
        handleApiError(error, 'Failed to fetch currently available hospitals.');
    }
};

export const getInitialHospitals = async (lat, lon, radiusKm) => {
    try {
        const params = { lat, lon, radiusKm };
        Object.keys(params).forEach(k => !params[k] && delete params[k]);
        const { data } = await axios.get(`${API_URL}/hospitals`, { params });
        return data.map(normalizeHospital);
    } catch (error) {
        handleApiError(error, 'Failed to fetch nearby hospitals.');
    }
};

/**
 * GET /api/autocomplete
 * Suggestions for doctors, specialties, and hospitals.
 */
export const fetchAutocompleteSuggestions = async (query, lat, lon) => {
    if (!query) return [];
    try {
        const { data } = await axios.get(`${API_URL}/autocomplete`, {
            params: { q: query, lat, lon },
        });
        return data;
    } catch (error) {
        console.error('Autocomplete fetch failed:', error);
        return [];
    }
};

/**
 * GET /api/search/advanced
 * Specialty search with optional date and radius filters.
 */
export const searchBySpecialty = async (specialty, lat, lon, date, radiusKm) => {
    try {
        const params = { q: specialty, lat, lon, date, radiusKm };
        Object.keys(params).forEach(k => !params[k] && delete params[k]);
        const { data } = await axios.get(`${API_URL}/search/advanced`, { params });
        return data.map(normalizeHospital);
    } catch (error) {
        handleApiError(error, 'Failed to perform specialty search.');
    }
};

/**
 * GET /api/hospitals/:id
 * Single hospital details.
 */
export const getHospitalDetails = async (hospitalId) => {
    try {
        const { data } = await axios.get(`${API_URL}/hospitals/${hospitalId}`);
        return data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch hospital details.');
    }
};

/**
 * GET /api/hospitals/:id/doctors
 * Doctors at a hospital with optional date / text filter.
 */
export const getDoctorsForHospital = async (hospitalId, date, query = '') => {
    try {
        const { data } = await axios.get(`${API_URL}/hospitals/${hospitalId}/doctors`, {
            params: { date: date || '', q: query },
        });
        return data;
    } catch (error) {
        throw new Error(error.response?.data?.error || 'Failed to fetch doctor details.');
    }
};

/**
 * GET /api/doctors/:id
 * Doctor details + hospitals sorted by proximity.
 */
export const getDoctorDetails = async (doctorId, lat, lon) => {
    try {
        const { data } = await axios.get(`${API_URL}/doctors/${doctorId}`, {
            params: { lat, lon },
        });
        return data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch doctor details.');
    }
};

/**
 * GET /api/route
 * Road-network route geometry (GeoJSON MultiLineString).
 */
/**
 * GET /api/route/ors
 * OpenRouteService route — real turn-by-turn, terrain, surface data.
 * Falls back to pgRouting when ORS key not configured.
 */
export const getOrsRoute = async (fromLat, fromLon, toLat, toLon, profile = 'driving-car') => {
    const coords = [fromLat, fromLon, toLat, toLon].map(Number);
    if (coords.some(isNaN)) {
        console.warn('[getOrsRoute] Invalid coords — skipping', { fromLat, fromLon, toLat, toLon });
        return null;
    }
    console.log(`[getOrsRoute] Calling ${API_URL}/route/ors`, { fromLat: coords[0], fromLon: coords[1], toLat: coords[2], toLon: coords[3] });
    try {
        const { data } = await axios.get(`${API_URL}/route/ors`, {
            params: { fromLat: coords[0], fromLon: coords[1], toLat: coords[2], toLon: coords[3], profile },
        });
        console.log('[getOrsRoute] Success — method:', data.routing_method, '| segments:', data.colored_segments?.length, '| time:', data.total_time_minutes, 'min');
        return data;
    } catch (error) {
        console.error('[getOrsRoute] FAILED:', error?.response?.status, error?.response?.data ?? error.message);
        return null;
    }
};

export const getRouteGeometry = async (fromLat, fromLon, toLat, toLon) => {
    // Guard — never send NaN to the server
    const coords = [fromLat, fromLon, toLat, toLon].map(Number);
    if (coords.some(isNaN)) {
        console.warn('[getRouteGeometry] Skipping route — invalid coordinates:', { fromLat, fromLon, toLat, toLon });
        return null;
    }
    try {
        const { data } = await axios.get(`${API_URL}/route`, {
            params: {
                fromLat: coords[0], fromLon: coords[1],
                toLat:   coords[2], toLon:   coords[3],
            },
        });
        // New response shape: { geometry, total_distance_m, total_time_minutes, steps, routing_method }
        // Return the full object; callers that only need geometry can use data.geometry
        return data;
    } catch (error) {
        // Don't throw — let callers handle null gracefully
        console.error('[getRouteGeometry]', error?.response?.data?.error || error.message);
        return null;
    }
};


// ─────────────────────────────────────────────
//  Decision-mode endpoints  (new)
// ─────────────────────────────────────────────

/**
 * GET /api/decision-mode
 * Hospitals sorted by the chosen priority.
 * @param {string} mode  'fastest' | 'wait' | 'rating' | 'cheapest'
 */
export const getHospitalsByDecisionMode = async (lat, lon, mode) => {
    try {
        const { data } = await axios.get(`${API_URL}/decision-mode`, {
            params: { lat, lon, mode },
        });
        return data.map(normalizeHospital);
    } catch (error) {
        handleApiError(error, 'Failed to fetch hospitals for selected mode.');
    }
};

/**
 * GET /api/emergency-hospitals
 * ICU-capable hospitals sorted by straight-line distance.
 */
export const getEmergencyHospitals = async (lat, lon) => {
    try {
        const { data } = await axios.get(`${API_URL}/emergency-hospitals`, {
            params: { lat, lon },
        });
        return data.map(normalizeHospital);
    } catch (error) {
        handleApiError(error, 'Failed to fetch emergency hospitals.');
    }
};

/**
 * POST /api/compare-hospitals
 * Side-by-side comparison data for an array of hospital IDs.
 * @param {number[]} hospitalIds
 */
export const compareHospitals = async (hospitalIds, lat, lon) => {
    try {
        const { data } = await axios.post(`${API_URL}/compare-hospitals`, {
            hospitalIds,
            lat,
            lon,
        });
        return data;
    } catch (error) {
        handleApiError(error, 'Failed to compare hospitals.');
    }
};

/**
 * GET /api/tradeoff-data
 * All hospitals with distance + quality metrics for scatter chart.
 */
export const getTradeoffData = async (lat, lon) => {
    try {
        const { data } = await axios.get(`${API_URL}/tradeoff-data`, {
            params: { lat, lon },
        });
        return data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch trade-off data.');
    }
};

/**
 * GET /api/hospital-load
 * Bed-load status (green / yellow / red) for every hospital.
 */
export const getHospitalLoadStatus = async () => {
    try {
        const { data } = await axios.get(`${API_URL}/hospital-load`);
        // Return as a Map for O(1) lookup by hospital_id
        return new Map(data.map(h => [h.hospital_id, h]));
    } catch (error) {
        console.error('Failed to fetch hospital load status:', error);
        return new Map(); // Non-fatal — fall back to default icon colour
    }
};