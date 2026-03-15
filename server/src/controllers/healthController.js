
const db = require('../db');

const REALISTIC_AVERAGE_SPEED_KMH = 40;

// The pgRouting edge query — only includes edges where length_m is NOT NULL.
// This is the single most common cause of Dijkstra returning NULL.
const PGR_EDGE_QUERY =
    `'SELECT gid AS id, source, target, length_m AS cost FROM ways WHERE length_m IS NOT NULL AND source IS NOT NULL AND target IS NOT NULL'`;


// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

const createDistanceFilter = (lat, lon, radiusKm) => {
    if (!radiusKm) return '';
    const radiusMeters = parseFloat(radiusKm) * 1000;
    const userGeog =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)::geography`;
    return `WHERE ST_DWithin(h.geom::geography, ${userGeog}, ${radiusMeters})`;
};

/** Returns true when ways has ≥1 row with a valid length_m. */
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


// ─────────────────────────────────────────────
//  GET /api/hospitals
// ─────────────────────────────────────────────

exports.getInitialHospitals = async (req, res) => {

    const { lat, lon, radiusKm } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parsedLon}, ${parsedLat}), 4326)`;
    const distanceFilter = createDistanceFilter(lat, lon, radiusKm);

    try {
        if (await hasRoadNetwork()) {

            const pgQuery = `
                WITH HospitalRoutes AS (
                    SELECT
                        h.hospital_id,
                        (SELECT id FROM ways_vertices_pgr
                         ORDER BY the_geom <-> h.geom LIMIT 1) AS hospital_node
                    FROM hospitals h
                    ${distanceFilter}
                ),
                UserNode AS (
                    SELECT id FROM ways_vertices_pgr
                    ORDER BY the_geom <-> ${userLocation} LIMIT 1
                ),
                RouteInfo AS (
                    SELECT
                        hr.hospital_id,
                        (SELECT SUM(cost)
                         FROM pgr_dijkstra(
                             ${PGR_EDGE_QUERY},
                             (SELECT id FROM UserNode),
                             hr.hospital_node,
                             false
                         )
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
                    GREATEST(5, ROUND(
                        ((ri.route_distance_meters / 1000) /
                         ${REALISTIC_AVERAGE_SPEED_KMH}) * 60
                    )) AS travel_time_minutes,
                    (SELECT COUNT(DISTINCT doctor_id)
                     FROM doctor_availability da
                     WHERE da.hospital_id = h.hospital_id) AS doctor_count,
                    hm.available_beds,
                    hm.avg_wait_time_minutes,
                    hm.hospital_rating,
                    hm.cost_level,
                    hm.emergency_level
                FROM hospitals h
                JOIN RouteInfo ri ON h.hospital_id = ri.hospital_id
                LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
                WHERE ri.route_distance_meters IS NOT NULL
                ORDER BY ri.route_distance_meters ASC;
            `;

            const { rows } = await db.query(pgQuery);

            if (rows.length > 0) {
                return res.status(200).json(rows);
            }

            console.warn(
                '[getInitialHospitals] pgRouting returned 0 results. ' +
                'Run GET /api/debug/network-check to diagnose. ' +
                'Falling back to straight-line distance.'
            );
        } else {
            console.warn('[getInitialHospitals] No valid road network — straight-line fallback.');
        }

        // ── Straight-line fallback ────────────────────────────────────────────
        const fallbackFilter = radiusKm ? createDistanceFilter(lat, lon, radiusKm) : '';

        const fallbackQuery = `
            SELECT
                h.hospital_id,
                h.name              AS hospital_name,
                h.address,
                ST_X(h.geom)        AS lon,
                ST_Y(h.geom)        AS lat,
                ROUND(ST_DistanceSphere(h.geom, ${userLocation})) AS route_distance_meters,
                GREATEST(5, ROUND(
                    ((ST_DistanceSphere(h.geom, ${userLocation}) / 1000) /
                     ${REALISTIC_AVERAGE_SPEED_KMH}) * 60
                )) AS travel_time_minutes,
                (SELECT COUNT(DISTINCT doctor_id)
                 FROM doctor_availability da
                 WHERE da.hospital_id = h.hospital_id) AS doctor_count,
                hm.available_beds,
                hm.avg_wait_time_minutes,
                hm.hospital_rating,
                hm.cost_level,
                hm.emergency_level
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
            ${fallbackFilter}
            ORDER BY route_distance_meters ASC;
        `;

        const { rows } = await db.query(fallbackQuery);
        return res.status(200).json(rows);

    } catch (err) {
        console.error('Error fetching initial hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/autocomplete
// ─────────────────────────────────────────────

exports.getAutocompleteSuggestions = async (req, res) => {

    const { q, lat, lon } = req.query;
    if (!q || !lat || !lon) return res.status(400).json([]);

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = `%${q.toLowerCase()}%`;

    try {
        const query = `
            SELECT * FROM (
                (SELECT 'doctor' AS type, d.doctor_id AS id,
                    d.name AS primary_text, d.specialization AS secondary_text,
                    (SELECT h.name FROM hospitals h
                     JOIN doctor_availability da ON h.hospital_id = da.hospital_id
                     WHERE da.doctor_id = d.doctor_id LIMIT 1) AS tertiary_text,
                    1 AS sort_order
                FROM doctors d WHERE LOWER(d.name) LIKE $1 LIMIT 5)

                UNION ALL

                (SELECT 'specialty' AS type, 0 AS id,
                    specialization AS primary_text, 'Specialty' AS secondary_text,
                    (COUNT(*) || ' doctors') AS tertiary_text, 2 AS sort_order
                FROM doctors WHERE LOWER(specialization) LIKE $1
                GROUP BY specialization LIMIT 5)

                UNION ALL

                (SELECT 'hospital' AS type, h.hospital_id AS id,
                    h.name AS primary_text,
                    ROUND((ST_DistanceSphere(h.geom, ${userLocation})/1000)::numeric,1)||' km' AS secondary_text,
                    'Hospital' AS tertiary_text, 3 AS sort_order
                FROM hospitals h WHERE LOWER(h.name) LIKE $1
                ORDER BY ST_DistanceSphere(h.geom, ${userLocation}) ASC LIMIT 5)
            ) AS suggestions
            ORDER BY sort_order LIMIT 7;
        `;
        const { rows } = await db.query(query, [searchQuery]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Autocomplete error:', err);
        res.status(500).json({ error: 'Internal Server Error fetching suggestions.' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/search  (dispatcher)
// ─────────────────────────────────────────────

exports.unifiedSearch = async (req, res) => {
    const { type, value, lat, lon } = req.query;
    if (!type || !value || !lat || !lon)
        return res.status(400).json({ error: 'Missing required search parameters.' });

    if (type === 'specialty') {
        req.query.q = value;
        return exports.advancedSearch(req, res);
    }
    res.status(200).json({
        message: `Search for ${type}: ${value} received. Client should handle navigation.`
    });
};


// ─────────────────────────────────────────────
//  GET /api/search/advanced
// ─────────────────────────────────────────────

exports.advancedSearch = async (req, res) => {

    const { lat, lon, q, date, radiusKm } = req.query;
    if (!lat || !lon || !q)
        return res.status(400).json({ error: 'Latitude, longitude, and a query are required.' });

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = `%${q.toLowerCase()}%`;
    let availabilityConditions = '';
    let queryParams = [searchQuery];

    if (date) {
        availabilityConditions =
            `AND da.day_of_week = EXTRACT(ISODOW FROM $${queryParams.length + 1}::date)`;
        queryParams.push(date);
    }

    const distanceFilter =
        createDistanceFilter(lat, lon, radiusKm).replace('WHERE', 'AND');

    try {
        const useRouting = await hasRoadNetwork();

        const distExpr = useRouting
            ? `(SELECT SUM(cost) FROM pgr_dijkstra(
                   ${PGR_EDGE_QUERY},
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1),
                   (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> th.geom LIMIT 1),
                   false
               ))`
            : `ST_DistanceSphere(th.geom, ${userLocation})`;

        const query = `
            WITH TargetHospitals AS (
                SELECT DISTINCT h.hospital_id, h.name, h.address, h.geom
                FROM hospitals h
                JOIN doctor_availability da ON h.hospital_id = da.hospital_id
                JOIN doctors d ON da.doctor_id = d.doctor_id
                WHERE LOWER(d.specialization) ILIKE $1
                ${availabilityConditions}
                ${distanceFilter}
            )
            SELECT
                th.hospital_id, th.name AS hospital_name, th.address,
                ST_X(th.geom) AS lon, ST_Y(th.geom) AS lat,
                ${distExpr} AS route_distance_meters,
                GREATEST(5, ROUND(((${distExpr}/1000)/${REALISTIC_AVERAGE_SPEED_KMH})*60)) AS travel_time_minutes,
                hm.available_beds, hm.avg_wait_time_minutes, hm.hospital_rating, hm.cost_level,
                (SELECT json_agg(name) FROM (
                    SELECT DISTINCT d.name FROM doctors d
                    JOIN doctor_availability da ON d.doctor_id = da.doctor_id
                    WHERE da.hospital_id = th.hospital_id AND d.specialization ILIKE $1
                    LIMIT 3
                ) dd) AS matching_doctors
            FROM TargetHospitals th
            LEFT JOIN hospital_metrics hm ON th.hospital_id = hm.hospital_id
            WHERE ${distExpr} IS NOT NULL
            ORDER BY route_distance_meters ASC;
        `;

        const { rows } = await db.query(query, queryParams);
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
    let query, queryParams = [id, searchQuery];

    if (date) {
        query = `
            SELECT d.doctor_id, d.name, d.specialization, da.day_of_week,
                to_char(da.start_time,'HH24:MI') AS start_time,
                to_char(da.end_time,'HH24:MI') AS end_time,
                (SELECT array_agg(DISTINCT day_of_week) FROM doctor_availability
                 WHERE doctor_id = d.doctor_id AND hospital_id = $1) AS available_days
            FROM doctors d JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE da.hospital_id=$1
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
                    'start_time',  to_char(da.start_time,'HH24:MI'),
                    'end_time',    to_char(da.end_time,'HH24:MI')
                ) ORDER BY da.day_of_week, da.start_time) AS all_schedules
            FROM doctors d JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE da.hospital_id=$1
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
    if (!lat || !lon)
        return res.status(400).json({ error: 'Latitude and longitude required.' });

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

    try {
        const doctorResult = await db.query(
            'SELECT doctor_id, name, specialization FROM doctors WHERE doctor_id = $1', [id]
        );
        if (doctorResult.rows.length === 0)
            return res.status(404).json({ error: 'Doctor not found.' });

        const avail = await db.query(`
            SELECT h.hospital_id, h.name AS hospital_name, h.address,
                da.day_of_week,
                to_char(da.start_time,'HH24:MI') AS start_time,
                to_char(da.end_time,'HH24:MI') AS end_time,
                ST_DistanceSphere(h.geom, ${userLocation}) AS distance_meters
            FROM doctor_availability da JOIN hospitals h ON da.hospital_id = h.hospital_id
            WHERE da.doctor_id = $1
            ORDER BY distance_meters, da.day_of_week;
        `, [id]);

        const byHospital = avail.rows.reduce((acc, row) => {
            if (!acc[row.hospital_id]) {
                acc[row.hospital_id] = {
                    hospital_id: row.hospital_id, hospital_name: row.hospital_name,
                    address: row.address, distance_meters: row.distance_meters, schedules: []
                };
            }
            acc[row.hospital_id].schedules.push({
                day_of_week: row.day_of_week,
                start_time: row.start_time, end_time: row.end_time
            });
            return acc;
        }, {});

        res.status(200).json({
            ...doctorResult.rows[0],
            hospitals: Object.values(byHospital)
        });
    } catch (err) {
        console.error('Error fetching doctor details:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/route
// ─────────────────────────────────────────────

exports.getRoute = async (req, res) => {
    const { fromLat, fromLon, toLat, toLon } = req.query;
    if (!fromLat || !fromLon || !toLat || !toLon)
        return res.status(400).json({ error: 'All four coordinates are required.' });

    const pFromLat = parseFloat(fromLat);
    const pFromLon = parseFloat(fromLon);
    const pToLat   = parseFloat(toLat);
    const pToLon   = parseFloat(toLon);

    // Reject if any value parsed to NaN — prevents "column nan does not exist"
    if ([pFromLat, pFromLon, pToLat, pToLon].some(isNaN)) {
        console.warn(`[getRoute] NaN coordinate: fromLat=${fromLat} fromLon=${fromLon} toLat=${toLat} toLon=${toLon}`);
        return res.status(400).json({
            error: `Invalid coordinates: fromLat=${fromLat} fromLon=${fromLon} toLat=${toLat} toLon=${toLon}`
        });
    }

    const startPoint = `ST_SetSRID(ST_MakePoint(${pFromLon}, ${pFromLat}), 4326)`;
    const endPoint   = `ST_SetSRID(ST_MakePoint(${pToLon},   ${pToLat}),   4326)`;

    try {
        const query = `
            WITH nodes AS (
                SELECT
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${startPoint} LIMIT 1) AS start_node,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${endPoint}   LIMIT 1) AS end_node
            ),
            route AS (
                SELECT * FROM pgr_dijkstra(
                    ${PGR_EDGE_QUERY},
                    (SELECT start_node FROM nodes),
                    (SELECT end_node   FROM nodes),
                    false
                )
            ),
            route_geom AS (
                SELECT route.seq, w.the_geom
                FROM route JOIN ways AS w ON route.edge = w.gid
                ORDER BY route.seq
            )
            SELECT ST_AsGeoJSON(ST_Collect(the_geom)) AS route_geometry FROM route_geom;
        `;
        const { rows } = await db.query(query);
        if (!rows[0]?.route_geometry)
            return res.status(404).json({ error: 'Route not found.' });
        res.status(200).json(JSON.parse(rows[0].route_geometry));
    } catch (err) {
        console.error('Error fetching route:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// ─────────────────────────────────────────────
//  GET /api/pareto-hospitals
// ─────────────────────────────────────────────

exports.getParetoHospitals = async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon)
        return res.status(400).json({ error: 'Latitude and longitude required.' });

    try {
        const { rows } = await db.query(`
            SELECT h.hospital_id, h.name,
                hm.available_beds, hm.avg_wait_time_minutes,
                hm.hospital_rating, hm.cost_level,
                ST_DistanceSphere(h.geom,
                    ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)
                ) / 1000 AS distance_km
            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id;
        `);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching Pareto hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};