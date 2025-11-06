const db = require('../db');

const realisticAverageSpeedKmh = 40; 

/**
 * @description Helper function to create a geofence SQL filter
 */
const createDistanceFilter = (lat, lon, radiusKm) => {
    if (!radiusKm) return '';
    const radiusMeters = parseFloat(radiusKm) * 1000;
    const userGeog = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)::geography`;
    return `WHERE ST_DWithin(h.geom::geography, ${userGeog}, ${radiusMeters})`;
};

/**
 * @description Fetches a list of nearby hospitals, sorted by road distance.
 * NOW WITH GEOFENCING.
 */
exports.getInitialHospitals = async (req, res) => {
    const { lat, lon, radiusKm } = req.query;
    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }
    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    
    // Get the distance filter clause ('WHERE ...' or '')
    const distanceFilter = createDistanceFilter(lat, lon, radiusKm);

    try {
        const query = `
            WITH HospitalRoutes AS (
                SELECT
                    h.hospital_id,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> h.geom LIMIT 1) AS hospital_node
                FROM hospitals h
                ${distanceFilter}
            ),
            RouteInfo AS (
                SELECT
                    hr.hospital_id,
                    (SELECT SUM(cost) FROM pgr_dijkstra(
                        'SELECT gid AS id, source, target, length_m AS cost FROM ways',
                        (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1),
                        hr.hospital_node,
                        false
                    )) AS route_distance_meters
                FROM HospitalRoutes hr
            )
            SELECT
                h.hospital_id,
                h.name as hospital_name,
                h.address,
                ST_X(h.geom) as lon, ST_Y(h.geom) as lat,
                ri.route_distance_meters,
                GREATEST(5, ROUND(((ri.route_distance_meters / 1000) / ${realisticAverageSpeedKmh}) * 60)) AS travel_time_minutes,
                (SELECT COUNT(DISTINCT doctor_id) FROM doctor_availability da WHERE da.hospital_id = h.hospital_id) as doctor_count
            FROM hospitals h
            JOIN RouteInfo ri ON h.hospital_id = ri.hospital_id
            WHERE ri.route_distance_meters IS NOT NULL
            ORDER BY ri.route_distance_meters ASC;
        `;
        const { rows } = await db.query(query);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching initial hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


/**
 * @description Provides advanced autocomplete suggestions for the main search bar.
 */
exports.getAutocompleteSuggestions = async (req, res) => {
    const { q, lat, lon } = req.query;
    if (!q || !lat || !lon) {
        return res.status(400).json([]);
    }

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = `%${q.toLowerCase()}%`;

    try {
        const query = `
            SELECT * FROM (
                -- Doctors
                (SELECT
                    'doctor' AS type,
                    d.doctor_id AS id,
                    d.name AS primary_text,
                    d.specialization AS secondary_text,
                    (SELECT h.name FROM hospitals h JOIN doctor_availability da ON h.hospital_id = da.hospital_id WHERE da.doctor_id = d.doctor_id LIMIT 1) AS tertiary_text,
                    1 as sort_order
                FROM doctors d
                WHERE LOWER(d.name) LIKE $1
                LIMIT 5)

                UNION ALL

                -- Specializations
                (SELECT
                    'specialty' AS type,
                    0 AS id, 
                    specialization AS primary_text,
                    'Specialty' AS secondary_text,
                    (COUNT(*) || ' doctors') AS tertiary_text,
                    2 as sort_order
                FROM doctors
                WHERE LOWER(specialization) LIKE $1
                GROUP BY specialization
                LIMIT 5)

                UNION ALL

                -- Hospitals
                (SELECT
                    'hospital' AS type,
                    h.hospital_id AS id,
                    h.name AS primary_text,
                    ROUND((ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 1) || ' km' AS secondary_text,
                    'Hospital' AS tertiary_text,
                    3 as sort_order
                FROM hospitals h
                WHERE LOWER(h.name) LIKE $1
                ORDER BY ST_DistanceSphere(h.geom, ${userLocation}) ASC
                LIMIT 5)
            ) AS suggestions
            ORDER BY sort_order
            LIMIT 7;
        `;
        const { rows } = await db.query(query, [searchQuery]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching autocomplete:', err);
        res.status(500).json({ error: 'Internal Server Error fetching suggestions.' });
    }
};

/**
 * @description NEW: Unified search endpoint to handle different query types.
 */
exports.unifiedSearch = async (req, res) => {
    const { type, value, lat, lon } = req.query;
    if (!type || !value || !lat || !lon) {
        return res.status(400).json({ error: 'Missing required search parameters.' });
    }
    
    if (type === 'specialty') {
        const { advancedSearch } = require('./healthController');
        req.query.q = value;
        return advancedSearch(req, res);
    }
    
    res.status(200).json({ message: `Search for ${type}: ${value} received. Client should handle navigation.` });
};


/**
 * @description REPURPOSED: Specialty search.
 * NOW WITH GEOFENCING.
 */
exports.advancedSearch = async (req, res) => {
    const { lat, lon, q, date, radiusKm } = req.query;
    if (!lat || !lon || !q) {
        return res.status(400).json({ error: 'Latitude, longitude, and a query are required.' });
    }

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = `%${q.toLowerCase()}%`;
    
    let availabilityConditions = '';
    let queryParams = [searchQuery];
    
    if (date) {
        availabilityConditions = `AND da.day_of_week = EXTRACT(ISODOW FROM $${queryParams.length + 1}::date)`;
        queryParams.push(date);
    }

    const distanceFilter = createDistanceFilter(lat, lon, radiusKm)
        .replace('WHERE', 'AND');

    try {
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
            HospitalRoutes AS (
                SELECT
                    th.hospital_id,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> th.geom LIMIT 1) AS hospital_node
                FROM TargetHospitals th
            ),
            RouteInfo AS (
                SELECT
                    hr.hospital_id,
                    (SELECT SUM(cost) FROM pgr_dijkstra('SELECT gid AS id, source, target, length_m AS cost FROM ways', (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1), hr.hospital_node, false)) AS route_distance_meters
                FROM HospitalRoutes hr
            )
            SELECT
                th.hospital_id, th.name AS hospital_name, th.address, ST_X(th.geom) as lon, ST_Y(th.geom) as lat,
                ri.route_distance_meters,
                GREATEST(5, ROUND(((ri.route_distance_meters / 1000) / ${realisticAverageSpeedKmh}) * 60)) AS travel_time_minutes,
                (
                    SELECT json_agg(name) FROM (
                        SELECT DISTINCT d.name
                        FROM doctors d
                        JOIN doctor_availability da ON d.doctor_id = da.doctor_id
                        WHERE da.hospital_id = th.hospital_id AND d.specialization ILIKE $1
                        LIMIT 3
                    ) as distinct_doctors
                ) as matching_doctors
            FROM TargetHospitals th
            JOIN RouteInfo ri ON th.hospital_id = ri.hospital_id
            WHERE ri.route_distance_meters IS NOT NULL
            ORDER BY ri.route_distance_meters ASC;
        `;
        const { rows } = await db.query(query, queryParams);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error in specialty search:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * @description Get details for a specific hospital by its ID.
 */
exports.getHospitalById = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query('SELECT hospital_id, name, address, phone FROM hospitals WHERE hospital_id = $1', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Hospital not found.' });
        }
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('Error fetching hospital details:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * @description Get available doctors for a specific hospital.
 */
exports.getDoctorsByHospital = async (req, res) => {
    const { id } = req.params;
    const { date, q } = req.query; // 'q' is the filter (name or specialty)
    const searchQuery = q ? `%${q.toLowerCase()}%` : '%';
    
    let query;
    let queryParams = [id, searchQuery];

    if (date) {
        // Return a flat list of doctors available on this specific day.
        query = `
            SELECT
                d.doctor_id,
                d.name,
                d.specialization,
                da.day_of_week,
                to_char(da.start_time, 'HH24:MI') as start_time,
                to_char(da.end_time, 'HH24:MI') as end_time,
                -- Get all days this doctor works at this hospital (for the simple card)
                (SELECT array_agg(DISTINCT day_of_week) FROM doctor_availability 
                 WHERE doctor_id = d.doctor_id AND hospital_id = $1) as available_days
            FROM doctors d
            JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE
                da.hospital_id = $1
                AND (LOWER(d.name) ILIKE $2 OR LOWER(d.specialization) ILIKE $2)
                AND da.day_of_week = EXTRACT(ISODOW FROM $3::date)
            ORDER BY d.name;
        `;
        queryParams.push(date);
    } else {
        // --- LOGIC 2: No Date is provided ---
        // Return a list of doctors, with their schedules aggregated into a JSON array.
        query = `
            SELECT
                d.doctor_id,
                d.name,
                d.specialization,
                -- Aggregate all schedules for this doctor AT THIS HOSPITAL into a single JSON field
                json_agg(
                    json_build_object(
                        'day_of_week', da.day_of_week,
                        'start_time', to_char(da.start_time, 'HH24:MI'),
                        'end_time', to_char(da.end_time, 'HH24:MI')
                    ) ORDER BY da.day_of_week, da.start_time
                ) AS all_schedules
            FROM doctors d
            JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE
                da.hospital_id = $1
                AND (LOWER(d.name) ILIKE $2 OR LOWER(d.specialization) ILIKE $2)
            GROUP BY d.doctor_id, d.name, d.specialization
            ORDER BY d.specialization, d.name;
        `;
    }
    
    try {
        const { rows } = await db.query(query, queryParams);
        // Send a flag to the frontend so it knows which type of data it's receiving
        res.status(200).json({ 
            isGroupedByDoctor: !date, // True if we used the new (no-date) logic
            doctors: rows 
        });
    } catch (err) {
        console.error('Error fetching doctors for hospital:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
/**
 * @description Get details for a single doctor, including all their availabilities.
 */
exports.getDoctorById = async (req, res) => {
    const { id } = req.params;
    const { lat, lon } = req.query;
    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required to sort hospitals.' });
    }
    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    
    try {
        const doctorQuery = 'SELECT doctor_id, name, specialization FROM doctors WHERE doctor_id = $1';
        const doctorResult = await db.query(doctorQuery, [id]);
        if (doctorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor not found.' });
        }

        const availabilityQuery = `
            SELECT
                h.hospital_id,
                h.name as hospital_name,
                h.address,
                da.day_of_week,
                to_char(da.start_time, 'HH24:MI') as start_time,
                to_char(da.end_time, 'HH24:MI') as end_time,
                ST_DistanceSphere(h.geom, ${userLocation}) AS distance_meters
            FROM doctor_availability da
            JOIN hospitals h ON da.hospital_id = h.hospital_id
            WHERE da.doctor_id = $1
            ORDER BY distance_meters, da.day_of_week;
        `;
        const availabilityResult = await db.query(availabilityQuery, [id]);

        const availabilityByHospital = availabilityResult.rows.reduce((acc, row) => {
            if (!acc[row.hospital_id]) {
                acc[row.hospital_id] = {
                    hospital_id: row.hospital_id,
                    hospital_name: row.hospital_name,
                    address: row.address,
                    distance_meters: row.distance_meters,
                    schedules: []
                };
            }
            acc[row.hospital_id].schedules.push({
                day_of_week: row.day_of_week,
                start_time: row.start_time,
                end_time: row.end_time
            });
            return acc;
        }, {});

        const response = {
            ...doctorResult.rows[0],
            hospitals: Object.values(availabilityByHospital)
        };
        
        res.status(200).json(response);
    } catch (err) {
        console.error('Error fetching doctor details:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRoute = async (req, res) => {
    const { fromLat, fromLon, toLat, toLon } = req.query;

    if (!fromLat || !fromLon || !toLat || !toLon) {
        return res.status(400).json({ error: 'All four coordinates (fromLat, fromLon, toLat, toLon) are required.' });
    }

    // 1. Create PostGIS points from the coordinates
    const startPoint = `ST_SetSRID(ST_MakePoint(${parseFloat(fromLon)}, ${parseFloat(fromLat)}), 4326)`;
    const endPoint = `ST_SetSRID(ST_MakePoint(${parseFloat(toLon)}, ${parseFloat(toLat)}), 4326)`;

    try {
        const query = `
            WITH
            -- Step 1: Find the nearest road network node to the start and end points
            nodes AS (
                SELECT
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${startPoint} LIMIT 1) AS start_node,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${endPoint} LIMIT 1) AS end_node
            ),
            -- Step 2: Run pgr_dijkstra to find the shortest path (list of road segment IDs)
            route AS (
                SELECT * FROM pgr_dijkstra(
                    'SELECT gid AS id, source, target, length_m AS cost FROM ways',
                    (SELECT start_node FROM nodes),
                    (SELECT end_node FROM nodes),
                    false
                )
            ),
            -- Step 3: Join the path results with the 'ways' table to get the actual road geometries
            route_geom AS (
                SELECT route.seq, w.the_geom
                FROM route
                JOIN ways AS w ON route.edge = w.gid
                ORDER BY route.seq
            )
            -- Step 4: Combine all road geometries into one single line and convert it to GeoJSON
            SELECT ST_AsGeoJSON(ST_Collect(the_geom)) AS route_geometry
            FROM route_geom;
        `;

        const { rows } = await db.query(query);

        if (!rows[0] || !rows[0].route_geometry) {
            return res.status(404).json({ error: 'Route not found.' });
        }
        
        // Parse the GeoJSON string from the DB and send it as a JSON object
        res.status(200).json(JSON.parse(rows[0].route_geometry));

    } catch (err) {
        console.error('Error fetching route:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};