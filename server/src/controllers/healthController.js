const db = require('../db');

// ─── pgRouting edge queries ───────────────────────────────────────────────────

/**
 * TIME-BASED routing: cost = cost_s (travel seconds).
 * Dijkstra finds the fastest route, accounting for road speed limits.
 * Falls back to length_m if cost_s is not available (older osm2pgrouting).
 */
const PGR_TIME_QUERY = `'SELECT gid AS id, source, target,
    CASE WHEN cost_s IS NOT NULL AND cost_s > 0 THEN cost_s ELSE length_m END AS cost,
    CASE WHEN reverse_cost_s IS NOT NULL AND reverse_cost_s > 0 THEN reverse_cost_s ELSE length_m END AS reverse_cost
    FROM ways
    WHERE length_m IS NOT NULL AND source IS NOT NULL AND target IS NOT NULL'`;

/** Distance-based fallback (when cost_s column absent) */
const PGR_DIST_QUERY = `'SELECT gid AS id, source, target, length_m AS cost
    FROM ways WHERE length_m IS NOT NULL AND source IS NOT NULL AND target IS NOT NULL'`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const createDistanceFilter = (lat, lon, radiusKm) => {
    if (!radiusKm) return '';
    const radiusMeters = parseFloat(radiusKm) * 1000;
    const userGeog = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)::geography`;
    return `WHERE ST_DWithin(h.geom::geography, ${userGeog}, ${radiusMeters})`;
};

/** Detect which columns exist in ways */
let _waysSchema = null; // cache

const getWaysSchema = async () => {
    if (_waysSchema) return _waysSchema;
    try {
        const { rows } = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'ways'
            AND column_name IN ('cost_s', 'reverse_cost_s', 'length_m', 'name', 'tag_id')
        `);
        _waysSchema = new Set(rows.map(r => r.column_name));
        return _waysSchema;
    } catch {
        return new Set(['length_m']);
    }
};

const hasRoadNetwork = async () => {
    try {
        const { rows } = await db.query(
            'SELECT 1 FROM ways WHERE length_m IS NOT NULL AND source IS NOT NULL LIMIT 1'
        );
        return rows.length > 0;
    } catch {
        return false;
    }
};

/** Get the right edge query based on available columns */
const getEdgeQuery = async () => {
    const schema = await getWaysSchema();
    return schema.has('cost_s') ? PGR_TIME_QUERY : PGR_DIST_QUERY;
};

/**
 * Convert Dijkstra SUM(cost) back to minutes.
 * If cost_s was used, result is already in seconds → divide by 60.
 * If length_m was used, estimate via 40 km/h.
 */
const costToMinutes = async (costValue) => {
    const schema = await getWaysSchema();
    if (schema.has('cost_s')) {
        return Math.max(1, Math.round(costValue / 60));
    }
    return Math.max(5, Math.round((costValue / 1000 / 40) * 60));
};


// ─────────────────────────────────────────────
//  GET /api/hospitals
//  Time-based pgRouting → straight-line fallback
// ─────────────────────────────────────────────

exports.getInitialHospitals = async (req, res) => {
    const { lat, lon, radiusKm } = req.query;

    if (!lat || !lon) return res.status(400).json({ error: 'Latitude and longitude are required.' });

    const pLat = parseFloat(lat), pLon = parseFloat(lon);
    const userLocation = `ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)`;
    const distanceFilter = createDistanceFilter(lat, lon, radiusKm);

    try {
        if (await hasRoadNetwork()) {
            const edgeQ = await getEdgeQuery();
            const schema = await getWaysSchema();
            const useTimeCost = schema.has('cost_s');

            const pgQuery = `
                WITH HospitalRoutes AS (
                    SELECT
                        h.hospital_id,
                        (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> h.geom LIMIT 1) AS hospital_node
                    FROM hospitals h
                    ${distanceFilter}
                ),
                UserNode AS (
                    SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1
                ),
                RouteInfo AS (
                    SELECT
                        hr.hospital_id,
                        (SELECT SUM(cost) FROM pgr_dijkstra(
                            ${edgeQ},
                            (SELECT id FROM UserNode),
                            hr.hospital_node,
                            true
                        )) AS route_cost,
                        -- Always also get the distance in metres for display
                        (SELECT SUM(w.length_m)
                         FROM pgr_dijkstra(
                             ${edgeQ},
                             (SELECT id FROM UserNode),
                             hr.hospital_node,
                             true
                         ) r JOIN ways w ON r.edge = w.gid
                        ) AS route_distance_meters
                    FROM HospitalRoutes hr
                    WHERE hr.hospital_node IS NOT NULL
                      AND hr.hospital_node != (SELECT id FROM UserNode)
                )
                SELECT
                    h.hospital_id,
                    h.name              AS hospital_name,
                    h.address,
                    ST_X(h.geom)        AS lon,
                    ST_Y(h.geom)        AS lat,
                    ri.route_distance_meters,
                    -- Travel time: from actual road cost (seconds) or estimated
                    GREATEST(1, ROUND(
                        CASE WHEN ${useTimeCost} THEN ri.route_cost / 60.0
                             ELSE (ri.route_distance_meters / 1000.0 / 40.0) * 60
                        END
                    )) AS travel_time_minutes,
                    (SELECT COUNT(DISTINCT doctor_id)
                     FROM doctor_availability da WHERE da.hospital_id = h.hospital_id) AS doctor_count,
                    hm.available_beds,
                    hm.avg_wait_time_minutes,
                    hm.hospital_rating,
                    hm.cost_level,
                    hm.emergency_level
                FROM hospitals h
                JOIN RouteInfo ri ON h.hospital_id = ri.hospital_id
                LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
                WHERE ri.route_cost IS NOT NULL
                ORDER BY travel_time_minutes ASC;
            `;

            const { rows } = await db.query(pgQuery);

            if (rows.length > 0) return res.status(200).json(rows);

            console.warn('[getInitialHospitals] pgRouting returned 0 results — falling back to straight-line.');
        } else {
            console.warn('[getInitialHospitals] No road network — straight-line fallback.');
        }

        // ── Straight-line fallback ────────────────────────────────────────────
        const fallbackFilter = radiusKm ? createDistanceFilter(lat, lon, radiusKm) : '';
        const fallbackQuery = `
            SELECT
                h.hospital_id, h.name AS hospital_name, h.address,
                ST_X(h.geom) AS lon, ST_Y(h.geom) AS lat,
                ROUND(ST_DistanceSphere(h.geom, ${userLocation})) AS route_distance_meters,
                GREATEST(5, ROUND((ST_DistanceSphere(h.geom, ${userLocation}) / 1000.0 / 40.0) * 60)) AS travel_time_minutes,
                (SELECT COUNT(DISTINCT doctor_id) FROM doctor_availability da WHERE da.hospital_id = h.hospital_id) AS doctor_count,
                hm.available_beds, hm.avg_wait_time_minutes, hm.hospital_rating, hm.cost_level, hm.emergency_level
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
            ${fallbackFilter}
            ORDER BY route_distance_meters ASC;
        `;
        const { rows: fallbackRows } = await db.query(fallbackQuery);
        return res.status(200).json(fallbackRows);

    } catch (err) {
        console.error('Error fetching hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/autocomplete
// ─────────────────────────────────────────────

exports.getAutocompleteSuggestions = async (req, res) => {
    const { q, lat, lon } = req.query;
    if (!q || !lat || !lon) return res.status(400).json([]);

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery  = `%${q.toLowerCase()}%`;

    try {
        const query = `
            SELECT * FROM (
                (SELECT 'doctor' AS type, d.doctor_id AS id, d.name AS primary_text,
                    d.specialization AS secondary_text,
                    (SELECT h.name FROM hospitals h JOIN doctor_availability da ON h.hospital_id = da.hospital_id
                     WHERE da.doctor_id = d.doctor_id LIMIT 1) AS tertiary_text, 1 AS sort_order
                FROM doctors d WHERE LOWER(d.name) LIKE $1 LIMIT 5)
                UNION ALL
                (SELECT 'specialty' AS type, 0 AS id, specialization AS primary_text,
                    'Specialty' AS secondary_text, (COUNT(*) || ' doctors') AS tertiary_text, 2 AS sort_order
                FROM doctors WHERE LOWER(specialization) LIKE $1 GROUP BY specialization LIMIT 5)
                UNION ALL
                (SELECT 'hospital' AS type, h.hospital_id AS id, h.name AS primary_text,
                    ROUND((ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 1) || ' km' AS secondary_text,
                    'Hospital' AS tertiary_text, 3 AS sort_order
                FROM hospitals h WHERE LOWER(h.name) LIKE $1
                ORDER BY ST_DistanceSphere(h.geom, ${userLocation}) ASC LIMIT 5)
            ) AS suggestions ORDER BY sort_order LIMIT 7;
        `;
        const { rows } = await db.query(query, [searchQuery]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Autocomplete error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/search (dispatcher)
// ─────────────────────────────────────────────

exports.unifiedSearch = async (req, res) => {
    const { type, value, lat, lon } = req.query;
    if (!type || !value || !lat || !lon)
        return res.status(400).json({ error: 'Missing required search parameters.' });
    if (type === 'specialty') { req.query.q = value; return exports.advancedSearch(req, res); }
    res.status(200).json({ message: `Search for ${type}: ${value} received. Client should handle navigation.` });
};


// ─────────────────────────────────────────────
//  GET /api/search/advanced
//  Time-based specialty search with smart comparison message
// ─────────────────────────────────────────────

exports.advancedSearch = async (req, res) => {
    const { lat, lon, q, date, radiusKm } = req.query;
    if (!lat || !lon || !q)
        return res.status(400).json({ error: 'Latitude, longitude, and a query are required.' });

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery  = `%${q.toLowerCase()}%`;
    let availabilityConditions = '';
    let queryParams = [searchQuery];

    if (date) {
        availabilityConditions = `AND da.day_of_week = EXTRACT(ISODOW FROM $${queryParams.length + 1}::date)`;
        queryParams.push(date);
    }

    const distanceFilter = createDistanceFilter(lat, lon, radiusKm).replace('WHERE', 'AND');

    try {
        const useRouting = await hasRoadNetwork();
        const edgeQ  = useRouting ? await getEdgeQuery() : null;
        const schema = useRouting ? await getWaysSchema() : new Set();
        const useTimeCost = schema.has('cost_s');

        // Distance expression for ordering — time-based when possible
        const costExpr = useRouting
            ? `(SELECT SUM(cost) FROM pgr_dijkstra(
                   ${edgeQ},
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1),
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> th.geom LIMIT 1),
                   true
               ))`
            : null;

        const distExpr = useRouting
            ? `(SELECT COALESCE(SUM(w.length_m), 0)
               FROM pgr_dijkstra(
                   ${edgeQ},
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1),
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> th.geom LIMIT 1),
                   true
               ) r JOIN ways w ON r.edge = w.gid)`
            : `ST_DistanceSphere(th.geom, ${userLocation})`;

        const travelTimeExpr = useRouting
            ? `GREATEST(1, ROUND(CASE WHEN ${useTimeCost} THEN ${costExpr} / 60.0
                                      ELSE (${distExpr} / 1000.0 / 40.0) * 60
                                 END))`
            : `GREATEST(5, ROUND((ST_DistanceSphere(th.geom, ${userLocation}) / 1000.0 / 40.0) * 60))`;

        const query = `
            WITH TargetHospitals AS (
                SELECT DISTINCT h.hospital_id, h.name, h.address, h.geom
                FROM hospitals h
                JOIN doctor_availability da ON h.hospital_id = da.hospital_id
                JOIN doctors d ON da.doctor_id = d.doctor_id
                WHERE LOWER(d.specialization) ILIKE $1
                ${availabilityConditions}
                ${distanceFilter}
            ),
            Routed AS (
                SELECT
                    th.hospital_id, th.name, th.address, th.geom,
                    ${useRouting ? costExpr : 'NULL::float'}       AS route_cost_s,
                    ${useRouting ? distExpr : `ST_DistanceSphere(th.geom, ${userLocation})`} AS route_distance_meters,
                    ${travelTimeExpr} AS travel_time_minutes
                FROM TargetHospitals th
            )
            SELECT
                r.hospital_id, r.name AS hospital_name, r.address,
                ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,
                r.route_distance_meters, r.travel_time_minutes,
                hm.available_beds, hm.avg_wait_time_minutes, hm.hospital_rating, hm.cost_level,
                (SELECT json_agg(name) FROM (
                    SELECT DISTINCT d.name FROM doctors d
                    JOIN doctor_availability da ON d.doctor_id = da.doctor_id
                    WHERE da.hospital_id = r.hospital_id AND d.specialization ILIKE $1
                    LIMIT 3
                ) dd) AS matching_doctors
            FROM Routed r
            LEFT JOIN hospital_metrics hm ON r.hospital_id = hm.hospital_id
            WHERE r.route_distance_meters IS NOT NULL AND r.route_distance_meters > 0
            ORDER BY r.travel_time_minutes ASC;
        `;

        const { rows } = await db.query(query, queryParams);

        // ── Smart comparison: tag when a farther hospital is faster ───────────
        if (rows.length >= 2) {
            const fastest    = rows[0];
            const nearest    = [...rows].sort((a, b) =>
                parseFloat(a.route_distance_meters) - parseFloat(b.route_distance_meters)
            )[0];

            if (nearest.hospital_id !== fastest.hospital_id) {
                const timeSaved = Math.round(
                    parseFloat(nearest.travel_time_minutes) - parseFloat(fastest.travel_time_minutes)
                );
                const distDiff  = (
                    (parseFloat(fastest.route_distance_meters) - parseFloat(nearest.route_distance_meters)) / 1000
                ).toFixed(1);

                fastest.smart_tip = timeSaved > 0
                    ? `${timeSaved} min faster than the nearest hospital (${Math.abs(distDiff)} km further via faster roads)`
                    : null;
            }
        }

        res.status(200).json(rows);

    } catch (err) {
        console.error('Error in advanced search:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/hospitals/:id
// ─────────────────────────────────────────────

exports.getHospitalById = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query(
            'SELECT hospital_id, name, address, phone FROM hospitals WHERE hospital_id = $1', [id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Hospital not found.' });
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('Error fetching hospital details:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/hospitals/:id/doctors
// ─────────────────────────────────────────────

exports.getDoctorsByHospital = async (req, res) => {
    const { id } = req.params;
    const { date, q } = req.query;
    const searchQuery = q ? `%${q.toLowerCase()}%` : '%';
    let query;
    let queryParams = [id, searchQuery];

    if (date) {
        query = `
            SELECT d.doctor_id, d.name, d.specialization, da.day_of_week,
                to_char(da.start_time, 'HH24:MI') AS start_time,
                to_char(da.end_time,   'HH24:MI') AS end_time,
                (SELECT array_agg(DISTINCT day_of_week) FROM doctor_availability
                 WHERE doctor_id = d.doctor_id AND hospital_id = $1) AS available_days
            FROM doctors d JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE da.hospital_id = $1
              AND (LOWER(d.name) ILIKE $2 OR LOWER(d.specialization) ILIKE $2)
              AND da.day_of_week = EXTRACT(ISODOW FROM $3::date)
            ORDER BY d.name;
        `;
        queryParams.push(date);
    } else {
        query = `
            SELECT d.doctor_id, d.name, d.specialization,
                json_agg(json_build_object(
                    'day_of_week', da.day_of_week,
                    'start_time',  to_char(da.start_time, 'HH24:MI'),
                    'end_time',    to_char(da.end_time,   'HH24:MI')
                ) ORDER BY da.day_of_week, da.start_time) AS all_schedules
            FROM doctors d JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE da.hospital_id = $1
              AND (LOWER(d.name) ILIKE $2 OR LOWER(d.specialization) ILIKE $2)
            GROUP BY d.doctor_id, d.name, d.specialization
            ORDER BY d.specialization, d.name;
        `;
    }

    try {
        const { rows } = await db.query(query, queryParams);
        res.status(200).json({ isGroupedByDoctor: !date, doctors: rows });
    } catch (err) {
        console.error('Error fetching doctors:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/doctors/:id
// ─────────────────────────────────────────────

exports.getDoctorById = async (req, res) => {
    const { id } = req.params;
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Latitude and longitude are required.' });

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

    try {
        const doctorResult = await db.query(
            'SELECT doctor_id, name, specialization FROM doctors WHERE doctor_id = $1', [id]
        );
        if (doctorResult.rows.length === 0) return res.status(404).json({ error: 'Doctor not found.' });

        const availabilityResult = await db.query(`
            SELECT h.hospital_id, h.name AS hospital_name, h.address,
                da.day_of_week,
                to_char(da.start_time, 'HH24:MI') AS start_time,
                to_char(da.end_time,   'HH24:MI') AS end_time,
                ST_DistanceSphere(h.geom, ${userLocation}) AS distance_meters
            FROM doctor_availability da JOIN hospitals h ON da.hospital_id = h.hospital_id
            WHERE da.doctor_id = $1 ORDER BY distance_meters, da.day_of_week;
        `, [id]);

        const byHospital = availabilityResult.rows.reduce((acc, row) => {
            if (!acc[row.hospital_id]) {
                acc[row.hospital_id] = {
                    hospital_id: row.hospital_id, hospital_name: row.hospital_name,
                    address: row.address, distance_meters: row.distance_meters, schedules: []
                };
            }
            acc[row.hospital_id].schedules.push({
                day_of_week: row.day_of_week, start_time: row.start_time, end_time: row.end_time
            });
            return acc;
        }, {});

        res.status(200).json({ ...doctorResult.rows[0], hospitals: Object.values(byHospital) });
    } catch (err) {
        console.error('Error fetching doctor:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/route
//  Returns GeoJSON geometry + turn-by-turn steps
//  Ordered by TRAVEL TIME (cost_s), not distance
// ─────────────────────────────────────────────

exports.getRoute = async (req, res) => {
    const { fromLat, fromLon, toLat, toLon } = req.query;
    if (!fromLat || !fromLon || !toLat || !toLon)
        return res.status(400).json({ error: 'All four coordinates are required.' });

    const pFromLat = parseFloat(fromLat), pFromLon = parseFloat(fromLon);
    const pToLat   = parseFloat(toLat),   pToLon   = parseFloat(toLon);

    if ([pFromLat, pFromLon, pToLat, pToLon].some(isNaN)) {
        return res.status(400).json({ error: `Invalid coordinates.` });
    }

    const startPoint = `ST_SetSRID(ST_MakePoint(${pFromLon}, ${pFromLat}), 4326)`;
    const endPoint   = `ST_SetSRID(ST_MakePoint(${pToLon},   ${pToLat}),   4326)`;

    try {
        const edgeQ  = await getEdgeQuery();
        const schema = await getWaysSchema();
        const hasName = schema.has('name');
        const hasTagId = schema.has('tag_id');
        const useTimeCost = schema.has('cost_s');

        const query = `
            WITH nodes AS (
                SELECT
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${startPoint} LIMIT 1) AS start_node,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${endPoint}   LIMIT 1) AS end_node
            ),
            route AS (
                SELECT * FROM pgr_dijkstra(
                    ${edgeQ},
                    (SELECT start_node FROM nodes),
                    (SELECT end_node   FROM nodes),
                    true
                )
            ),
            route_segments AS (
                SELECT
                    route.seq,
                    route.cost,
                    w.the_geom,
                    w.length_m,
                    ${hasName   ? 'w.name'   : "''"}   AS road_name,
                    ${hasTagId  ? 'w.tag_id' : 'NULL'} AS tag_id,
                    ${useTimeCost ? 'w.cost_s' : 'NULL'} AS cost_s,
                    ${useTimeCost ? 'w.maxspeed_forward' : 'NULL'} AS speed_kmh
                FROM route JOIN ways w ON route.edge = w.gid
                ORDER BY route.seq
            )
            SELECT
                ST_AsGeoJSON(ST_Collect(the_geom ORDER BY seq)) AS route_geometry,
                SUM(length_m)         AS total_distance_m,
                ${useTimeCost
                    ? 'ROUND(SUM(cost_s) / 60.0)'
                    : 'ROUND(SUM(length_m) / 1000.0 / 40.0 * 60)'
                }                     AS total_time_minutes,
                -- Turn-by-turn: group consecutive same-name segments
                json_agg(json_build_object(
                    'seq',       seq,
                    'road',      COALESCE(road_name, 'Unnamed road'),
                    'distance_m', ROUND(length_m::numeric, 0),
                    'time_s',    ROUND(COALESCE(cost_s, length_m / 1000.0 / 40.0 * 3600)::numeric, 0),
                    'speed_kmh', ROUND(COALESCE(speed_kmh, 40)::numeric, 0),
                    'tag_id',    tag_id
                ) ORDER BY seq) AS steps
            FROM route_segments;
        `;

        const { rows } = await db.query(query);

        if (!rows[0]?.route_geometry) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        // Compress steps: merge consecutive segments on the same named road
        const rawSteps = rows[0].steps ?? [];
        const mergedSteps = [];
        for (const step of rawSteps) {
            const last = mergedSteps[mergedSteps.length - 1];
            if (last && last.road === step.road) {
                last.distance_m += step.distance_m;
                last.time_s     += step.time_s;
            } else {
                mergedSteps.push({ ...step });
            }
        }

        res.status(200).json({
            geometry:           JSON.parse(rows[0].route_geometry),
            total_distance_m:   Math.round(rows[0].total_distance_m),
            total_time_minutes: Math.round(rows[0].total_time_minutes),
            steps:              mergedSteps,
            routing_method:     useTimeCost ? 'time_based' : 'distance_based',
        });

    } catch (err) {
        console.error('Error fetching route:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/route/ors
//  OpenRouteService routing — real traffic-aware,
//  terrain-aware, turn-by-turn in plain English.
//  Requires ORS_API_KEY in .env
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  GET /api/route/ors
// ─────────────────────────────────────────────

exports.getOrsRoute = async (req, res) => {
    const { fromLat, fromLon, toLat, toLon, profile = 'driving-car' } = req.query;

    if (!fromLat || !fromLon || !toLat || !toLon) {
        return res.status(400).json({ error: 'All four coordinates are required.' });
    }

    const coords = [fromLat, fromLon, toLat, toLon].map(Number);
    if (coords.some(isNaN)) {
        return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
        console.warn('[ORS] ORS_API_KEY not set in .env');
        return res.status(503).json({
            error: 'ORS_API_KEY not configured.',
            hint:  'Add ORS_API_KEY=your_key to your .env file.'
        });
    }

    const axios = require('axios');

    try {
        console.log(`[ORS] Requesting route [${coords[0]},${coords[1]}] → [${coords[2]},${coords[3]}]`);

        const orsRes = await axios.post(
            `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
            {
                coordinates: [
                    [coords[1], coords[0]],
                    [coords[3], coords[2]],
                ],
                elevation:    true,
                instructions: true,
                language:     'en',
                units:        'm',
                attributes:   ['avgspeed', 'detourfactor'],
                extra_info:   ['surface', 'waycategory', 'waytype', 'steepness'],
            },
            {
                headers: {
                    'Authorization': apiKey,
                    'Content-Type':  'application/json',
                    'Accept':        'application/json, application/geo+json',
                },
                timeout: 10000,
            }
        );

        const data    = orsRes.data;
        const feature = data.features?.[0];
        if (!feature) return res.status(404).json({ error: 'No route found by ORS.' });

        console.log(`[ORS] OK — ${Math.round(feature.properties.summary.distance)}m, ${Math.round(feature.properties.summary.duration / 60)} min`);

        const summary    = feature.properties.summary;
        const allCoords  = feature.geometry.coordinates; // [[lon,lat,ele], ...]
        const segments   = feature.properties.segments?.[0]?.steps ?? [];
        const extras     = feature.properties.extras ?? {};

        // ── Speed-based segment coloring ──────────────────────────────────────
        //
        // Color logic (speed in km/h):
        //   green  ≥ 60   fast road (highway / primary)
        //   yellow 30–59  moderate (secondary / residential)
        //   red    < 30   slow / unpaved / steep terrain
        //
        // Each ORS step has:
        //   step.way_points = [startIdx, endIdx]  → indices into allCoords
        //   step.distance   → metres
        //   step.duration   → seconds
        //   → speed = (distance / duration) * 3.6

        const speedColor = (speedKmh) => {
            if (speedKmh >= 60) return '#16a34a';   // green
            if (speedKmh >= 30) return '#f59e0b';   // yellow
            return '#dc2626';                        // red
        };

        // Also factor in steepness from extra_info
        // steepness values: negative = downhill, positive = uphill, >4 = very steep
        const steepnessMap = {};  // coordIndex → steepness value
        (extras.steepness?.values ?? []).forEach(([from, to, val]) => {
            for (let i = from; i < to; i++) steepnessMap[i] = val;
        });

        // Build colored GeoJSON LineString segments
        const coloredSegments = segments
            .filter(s => s.way_points && s.distance > 0 && s.duration > 0)
            .map(s => {
                const [startIdx, endIdx] = s.way_points;
                const segCoords = allCoords.slice(startIdx, endIdx + 1);
                if (segCoords.length < 2) return null;

                const speedKmh = (s.distance / s.duration) * 3.6;

                // Steepness penalty: if avg steepness > 3, make it slower-appearing
                const avgSteepness = segCoords.reduce((sum, _, i) =>
                    sum + Math.abs(steepnessMap[startIdx + i] ?? 0), 0
                ) / segCoords.length;

                const effectiveSpeed = avgSteepness > 3
                    ? speedKmh * 0.6   // steep terrain penalty
                    : speedKmh;

                return {
                    type: 'Feature',
                    properties: {
                        road:       s.name || 'Unnamed road',
                        distance_m: Math.round(s.distance),
                        time_s:     Math.round(s.duration),
                        speed_kmh:  Math.round(speedKmh),
                        steepness:  Math.round(avgSteepness * 10) / 10,
                        color:      speedColor(effectiveSpeed),
                        label:      effectiveSpeed >= 60 ? 'Fast' : effectiveSpeed >= 30 ? 'Moderate' : 'Slow',
                        type_id:    s.type,
                        instruction: s.instruction ?? '',
                    },
                    geometry: {
                        type:        'LineString',
                        coordinates: segCoords.map(c => [c[0], c[1]]), // strip elevation for Leaflet
                    },
                };
            })
            .filter(Boolean);

        // ── Surface breakdown ─────────────────────────────────────────────────

        const surfaceValues = extras.surface?.values ?? [];
        const SURFACE_LABEL = {
            0:'Unknown', 1:'Paved', 2:'Unpaved', 3:'Gravel',
            4:'Dirt', 5:'Sand', 6:'Cobblestone', 99:'Other'
        };
        const surfaceSummary = {};
        surfaceValues.forEach(([start, end, type]) => {
            const label = SURFACE_LABEL[type] ?? 'Other';
            surfaceSummary[label] = (surfaceSummary[label] ?? 0) + (end - start);
        });
        const totalPts = Object.values(surfaceSummary).reduce((s, v) => s + v, 0) || 1;
        const surfaceBreakdown = Object.entries(surfaceSummary)
            .map(([label, pts]) => ({ label, percent: Math.round((pts / totalPts) * 100) }))
            .sort((a, b) => b.percent - a.percent);

        const hasUnpavedRoads = (surfaceBreakdown.find(s =>
            ['Unpaved', 'Gravel', 'Dirt', 'Sand'].includes(s.label)
        )?.percent ?? 0) > 20;

        // ── Steps for turn-by-turn panel ─────────────────────────────────────

        const steps = segments.map(s => ({
            instruction: s.instruction ?? '',
            road:        s.name || 'Unnamed road',
            distance_m:  Math.round(s.distance),
            time_s:      Math.round(s.duration),
            speed_kmh:   Math.round((s.distance / (s.duration || 1)) * 3.6),
            color:       speedColor((s.distance / (s.duration || 1)) * 3.6),
            type:        s.type,
        })).filter(s => s.distance_m > 0);

        res.status(200).json({
            // Full geometry (for fallback / bounds fitting)
            geometry:           feature.geometry,
            // Colored segments for multi-color rendering
            colored_segments:   coloredSegments,
            total_distance_m:   Math.round(summary.distance),
            total_time_minutes: Math.round(summary.duration / 60),
            ascent_m:           Math.round(feature.properties.ascent  ?? 0),
            descent_m:          Math.round(feature.properties.descent ?? 0),
            surface_breakdown:  surfaceBreakdown,
            has_unpaved_roads:  hasUnpavedRoads,
            steps,
            routing_method:     'ors',
            profile,
        });

    } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data ?? err.message;
        console.error(`[ORS] Error ${status ?? 'network'}:`, JSON.stringify(detail));
        res.status(502).json({
            error:  'ORS API error',
            status,
            detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
        });
    }
};

// ─────────────────────────────────────────────
//  GET /api/hospitals/currently-available
// ─────────────────────────────────────────────

exports.getCurrentlyAvailable = async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required.' });

    const pLat = parseFloat(lat), pLon = parseFloat(lon);
    const userLoc = `ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)`;

    try {
        const useRouting  = await hasRoadNetwork();
        const edgeQ       = useRouting ? await getEdgeQuery() : null;
        const schema      = useRouting ? await getWaysSchema() : new Set();
        const useTimeCost = schema.has('cost_s');

        const routeCostExpr = useRouting
            ? `(SELECT SUM(cost) FROM pgr_dijkstra(${edgeQ},
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLoc} LIMIT 1),
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> h.geom LIMIT 1),
                   true))`
            : null;

        const travelMinExpr = useRouting
            ? `GREATEST(1, ROUND(CASE WHEN ${useTimeCost}
                                      THEN ${routeCostExpr} / 60.0
                                      ELSE (ST_DistanceSphere(h.geom,${userLoc})/1000.0/40.0)*60
                                 END))`
            : `GREATEST(1, ROUND((ST_DistanceSphere(h.geom,${userLoc})/1000.0/40.0)*60))`;

        const distExpr = useRouting
            ? `COALESCE((SELECT SUM(w.length_m) FROM pgr_dijkstra(${edgeQ},
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLoc} LIMIT 1),
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> h.geom LIMIT 1),
                   true) r JOIN ways w ON r.edge = w.gid), 0)`
            : `ST_DistanceSphere(h.geom,${userLoc})`;

        const query = `
            WITH on_duty AS (
                SELECT
                    da.hospital_id,
                    d.doctor_id,
                    d.name          AS doctor_name,
                    d.specialization,
                    da.start_time,
                    da.end_time,
                    ROUND(EXTRACT(EPOCH FROM (da.end_time - CURRENT_TIME::time)) / 60)
                                    AS remaining_minutes
                FROM doctor_availability da
                JOIN doctors d ON da.doctor_id = d.doctor_id
                WHERE da.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
                  AND da.start_time  <= CURRENT_TIME::time
                  AND da.end_time    >  CURRENT_TIME::time
            ),
            hospital_summary AS (
                SELECT
                    hospital_id,
                    COUNT(DISTINCT doctor_id)   AS on_duty_count,
                    MAX(remaining_minutes)       AS max_remaining_min,
                    json_agg(json_build_object(
                        'doctor_id',        doctor_id,
                        'name',             doctor_name,
                        'specialization',   specialization,
                        'end_time',         to_char(end_time,'HH24:MI'),
                        'remaining_minutes',remaining_minutes
                    ) ORDER BY remaining_minutes DESC) AS available_doctors
                FROM on_duty
                GROUP BY hospital_id
            )
            SELECT
                h.hospital_id,
                h.name                                                      AS hospital_name,
                h.address,
                ST_X(h.geom)                                                AS lon,
                ST_Y(h.geom)                                                AS lat,

                hs.on_duty_count,
                hs.max_remaining_min,
                hs.available_doctors,

                ROUND(${distExpr})                                          AS route_distance_meters,
                (${travelMinExpr})                                          AS travel_time_minutes,

                (hs.max_remaining_min > (${travelMinExpr}) + 5)            AS reachable_in_time,
                GREATEST(0, hs.max_remaining_min - (${travelMinExpr}))     AS net_window_minutes,

                hm.available_beds,
                hm.total_beds,
                hm.avg_wait_time_minutes,
                hm.hospital_rating,
                hm.cost_level,
                hm.emergency_level

            FROM hospitals h
            JOIN hospital_summary hs       ON h.hospital_id = hs.hospital_id
            LEFT JOIN hospital_metrics hm  ON h.hospital_id = hm.hospital_id

            ORDER BY reachable_in_time DESC, net_window_minutes DESC, travel_time_minutes ASC;
        `;

        const { rows } = await db.query(query);

        // ── Pareto scoring on results ─────────────────────────────────────────
        if (rows.length >= 2) {
            const nums = rows.map(r => ({
                window: Math.max(0, parseFloat(r.net_window_minutes) ?? 0),
                rating: parseFloat(r.hospital_rating) ?? 0,
                travel: parseFloat(r.travel_time_minutes) ?? 999,
                beds:   parseFloat(r.available_beds)  ?? 0,
                cost:   parseFloat(r.cost_level)       ?? 3,
            }));

            const ranges = {};
            ['window','rating','travel','beds','cost'].forEach(k => {
                ranges[k] = {
                    min: Math.min(...nums.map(n => n[k])),
                    max: Math.max(...nums.map(n => n[k])),
                };
            });

            const norm = (v, min, max, lowerBetter) => {
                if (max === min) return 0.5;
                const ratio = (v - min) / (max - min);
                return lowerBetter ? 1 - ratio : ratio;
            };

            rows.forEach((r, i) => {
                r.pareto_score = Math.round((
                    0.35 * norm(nums[i].window, ranges.window.min, ranges.window.max, false) +
                    0.25 * norm(nums[i].rating, ranges.rating.min, ranges.rating.max, false) +
                    0.20 * norm(nums[i].travel, ranges.travel.min, ranges.travel.max, true)  +
                    0.10 * norm(nums[i].beds,   ranges.beds.min,   ranges.beds.max,   false) +
                    0.10 * norm(nums[i].cost,   ranges.cost.min,   ranges.cost.max,   true)
                ) * 100);
            });

            // Sort by score descending
            rows.sort((a, b) => (b.pareto_score ?? 0) - (a.pareto_score ?? 0));
            if (rows.length > 0) rows[0].is_best_now = true;
        }

        res.status(200).json(rows);

    } catch (err) {
        console.error('[getCurrentlyAvailable]', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


exports.getParetoHospitals = async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Latitude and longitude required.' });

    try {
        const { rows } = await db.query(`
            SELECT h.hospital_id, h.name,
                hm.available_beds, hm.avg_wait_time_minutes, hm.hospital_rating, hm.cost_level,
                ST_DistanceSphere(h.geom, ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)) / 1000 AS distance_km
            FROM hospitals h JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id;
        `);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching Pareto hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};