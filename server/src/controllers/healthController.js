const db = require('../db');

/**
 * @description LEGACY: Simple hospital search by distance. We are replacing this with advancedSearch.
 * This can be kept for other purposes or removed.
 */
exports.searchHospitals = async (req, res) => {
    const { lat, lon, q } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = q ? `%${q}%` : '%';

    try {
        const query = `
            WITH MatchedHospitals AS (
                -- Find hospital IDs that match the search query
                SELECT DISTINCT h.hospital_id
                FROM hospitals h
                LEFT JOIN doctor_availability da ON h.hospital_id = da.hospital_id
                LEFT JOIN doctors d ON da.doctor_id = d.doctor_id
                WHERE
                    h.name ILIKE $1 OR
                    d.name ILIKE $1 OR
                    d.specialization ILIKE $1
            )
            SELECT
                h.hospital_id,
                h.name,
                h.address,
                ST_X(h.geom) as lon,
                ST_Y(h.geom) as lat,
                -- Calculate distance in meters (straight line)
                ST_DistanceSphere(h.geom, ${userLocation}) AS distance_in_meters
            FROM hospitals h
            -- If a search query is provided, join with matches, otherwise include all
            ${q ? 'JOIN MatchedHospitals mh ON h.hospital_id = mh.hospital_id' : ''}
            ORDER BY distance_in_meters ASC;
        `;

        const { rows } = await db.query(query, [searchQuery]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error searching hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


/**
 * @description NEW: Advanced search for doctors/hospitals.
 * Filters by:
 * - User location (lat, lon) - required
 * - Text query (q: doctor name, hospital name, specialization)
 * - Specific date (date: 'YYYY-MM-DD')
 * - Specific time (time: 'HH24:MI')
 * - Availability within a set number of minutes (withinMinutes: number)
 * It calculates travel time using pgRouting.
 */
exports.advancedSearch = async (req, res) => {
    const { lat, lon, q, date, time, withinMinutes } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const userLocation = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
    const searchQuery = q ? `%${q.toLowerCase()}%` : '%';

      const realisticAverageSpeedKmh = 40; 
    
    // Build dynamic WHERE clauses for availability (this part is correct)
    let availabilityConditions = [];
    let queryParams = [searchQuery, searchQuery, searchQuery];
    if (date) {
        availabilityConditions.push(`da.day_of_week = EXTRACT(ISODOW FROM $${queryParams.length + 1}::date)`);
        queryParams.push(date);
        if (time) {
            availabilityConditions.push(`$${queryParams.length + 1}::time BETWEEN da.start_time AND da.end_time`);
            queryParams.push(time);
        }
    }
    if (withinMinutes) {
        const targetTimestamp = `NOW() + INTERVAL '${parseInt(withinMinutes)} minutes'`;
        availabilityConditions.push(`da.day_of_week = EXTRACT(ISODOW FROM ${targetTimestamp})`);
        availabilityConditions.push(`CAST(${targetTimestamp} AS TIME) BETWEEN da.start_time AND da.end_time`);
    }
    const availabilityWhereClause = availabilityConditions.length > 0 ? `AND ${availabilityConditions.join(' AND ')}` : '';

    try {
        const query = `
            WITH AvailableDoctors AS (
                -- Step 1: Find all doctors/hospitals matching the text and time filters
                SELECT
                    d.doctor_id,
                    d.name AS doctor_name,
                    d.specialization,
                    h.hospital_id,
                    h.name AS hospital_name,
                    h.address,
                    h.geom,
                    to_char(da.start_time, 'HH24:MI') as start_time,
                    to_char(da.end_time, 'HH24:MI') as end_time
                FROM doctors d
                JOIN doctor_availability da ON d.doctor_id = da.doctor_id
                JOIN hospitals h ON da.hospital_id = h.hospital_id
                WHERE (LOWER(d.name) ILIKE $1 OR LOWER(d.specialization) ILIKE $2 OR LOWER(h.name) ILIKE $3)
                ${availabilityWhereClause}
            ),
            HospitalRoutes AS (
                -- Step 2: Find the nearest road network nodes for the user and each hospital
                SELECT DISTINCT
                    ad.hospital_id,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ${userLocation} LIMIT 1) AS user_node,
                    (SELECT id FROM ways_vertices_pgr ORDER BY the_geom <-> ad.geom LIMIT 1) AS hospital_node
                FROM AvailableDoctors ad
            ),
            RouteInfo AS (
                -- CORRECTED: Step 3: Calculate distance using 'length_m' and time using 'cost_s'
                SELECT
                    hr.hospital_id,
                    -- A) THIS IS THE FIX: Calculate distance by summing the length_m column (in meters)
                    (SELECT SUM(cost) FROM pgr_dijkstra(
                        'SELECT gid AS id, source, target, length_m AS cost FROM ways',
                        hr.user_node,
                        hr.hospital_node,
                        false
                    )) AS route_distance_meters,

                    -- B) Calculate time by summing the cost_s column (in seconds)
                    (SELECT SUM(cost) FROM pgr_dijkstra(
                        'SELECT gid AS id, source, target, cost_s AS cost FROM ways',
                        hr.user_node,
                        hr.hospital_node,
                        false
                    )) AS route_time_seconds
                FROM HospitalRoutes hr
            )
            -- Step 4: Final Assembly
         SELECT
                ad.hospital_id, ad.hospital_name, ad.address,
                ST_X(ad.geom) as lon, ST_Y(ad.geom) as lat,
                ri.route_distance_meters,
                
                -- REVISED CALCULATION: Time is now derived from distance and our fixed average speed.
                -- Formula: (distance_km / speed_kmh) * 60_mins_per_hour
                -- We also set a base time of 5 minutes.
                GREATEST(5, ROUND(((ri.route_distance_meters / 1000) / ${realisticAverageSpeedKmh}) * 60)) AS travel_time_minutes,
                
                json_agg(
                    json_build_object(
                        'doctor_id', ad.doctor_id, 'name', ad.doctor_name, 'specialization', ad.specialization,
                        'start_time', ad.start_time, 'end_time', ad.end_time
                    )
                ) AS available_doctors
            FROM AvailableDoctors ad
            JOIN RouteInfo ri ON ad.hospital_id = ri.hospital_id
            WHERE ri.route_distance_meters IS NOT NULL AND ri.route_time_seconds IS NOT NULL
            GROUP BY ad.hospital_id, ad.hospital_name, ad.address, ad.geom, ri.route_distance_meters, ri.route_time_seconds
            ORDER BY ri.route_time_seconds ASC; -- Sort by fastest time
        `;

        const { rows } = await db.query(query, queryParams);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error in advanced search:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * @description MODIFIED: Get available doctors for a specific hospital.
 */
exports.getDoctorsByHospital = async (req, res) => {
    const { id } = req.params;
    const { date, q } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'A date parameter is required.' });
    }

    const searchQuery = q ? `%${q.toLowerCase()}%` : '%';

    try {
        const query = `
            SELECT
                d.doctor_id,
                d.name,
                d.specialization,
                to_char(da.start_time, 'HH24:MI') as start_time,
                to_char(da.end_time, 'HH24:MI') as end_time
            FROM doctors d
            JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE
                da.hospital_id = $1
                AND da.day_of_week = EXTRACT(ISODOW FROM $2::date)
                AND (
                    LOWER(d.name) ILIKE $3 OR
                    LOWER(d.specialization) ILIKE $3
                )
            ORDER BY d.specialization, d.name;
        `;

        const { rows } = await db.query(query, [id, date, searchQuery]);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error fetching doctors for hospital:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};