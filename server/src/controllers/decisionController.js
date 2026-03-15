
const db = require('../db');

const REALISTIC_AVERAGE_SPEED_KMH = 40;


// ----------------------------
// GET /api/decision-mode
// ----------------------------

exports.getHospitalsByDecisionMode = async (req, res) => {

    const { lat, lon, mode } = req.query;

    if (!lat || !lon || !mode) {
        return res.status(400).json({ error: 'lat, lon, and mode are required.' });
    }

    const VALID_MODES = ['fastest', 'wait', 'rating', 'cheapest'];
    if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({
            error: `Invalid mode. Choose one of: ${VALID_MODES.join(', ')}.`
        });
    }

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

    const orderMap = {
        fastest:  'travel_time_minutes ASC',
        wait:     'hm.avg_wait_time_minutes ASC NULLS LAST',
        rating:   'hm.hospital_rating DESC NULLS LAST',
        cheapest: 'hm.cost_level ASC NULLS LAST',
    };

    try {

        const query = `
            SELECT
                h.hospital_id,
                h.name              AS hospital_name,
                h.address,
                ST_X(h.geom)        AS lon,
                ST_Y(h.geom)        AS lat,

                hm.available_beds,
                hm.avg_wait_time_minutes,
                hm.hospital_rating,
                hm.cost_level,
                hm.emergency_level,

                ROUND(
                    (ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2
                ) AS distance_km,

                ROUND(
                    (ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2
                ) * 1000 AS route_distance_meters,

                GREATEST(5, ROUND(
                    ((ST_DistanceSphere(h.geom, ${userLocation}) / 1000) /
                     ${REALISTIC_AVERAGE_SPEED_KMH}) * 60
                )) AS travel_time_minutes,

                (SELECT COUNT(DISTINCT doctor_id)
                 FROM doctor_availability da
                 WHERE da.hospital_id = h.hospital_id) AS doctor_count

            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id

            ORDER BY ${orderMap[mode]}
            LIMIT 20;
        `;

        const { rows } = await db.query(query);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error in decision-mode search:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }

};


// ----------------------------
// GET /api/emergency-hospitals
// ----------------------------

exports.getEmergencyHospitals = async (req, res) => {

    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'lat and lon are required.' });
    }

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

    try {

        const query = `
            SELECT
                h.hospital_id,
                h.name              AS hospital_name,
                h.address,
                h.phone,
                ST_X(h.geom)        AS lon,
                ST_Y(h.geom)        AS lat,

                hm.icu_beds,
                hm.emergency_level,
                hm.available_beds,
                hm.ambulance_available,
                hm.avg_wait_time_minutes,
                hm.hospital_rating,
                hm.cost_level,

                ROUND(
                    (ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2
                ) AS distance_km,

                ROUND(
                    (ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2
                ) * 1000 AS route_distance_meters,

                GREATEST(5, ROUND(
                    ((ST_DistanceSphere(h.geom, ${userLocation}) / 1000) /
                     ${REALISTIC_AVERAGE_SPEED_KMH}) * 60
                )) AS travel_time_minutes

            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id

            WHERE
                hm.icu_beds > 0
                AND hm.emergency_level >= 2

            ORDER BY distance_km ASC
            LIMIT 20;
        `;

        const { rows } = await db.query(query);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error fetching emergency hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }

};


// ----------------------------
// POST /api/compare-hospitals
// Body: { hospitalIds: [1,2,3], lat: 22.3, lon: 87.3 }
// ----------------------------

exports.compareHospitals = async (req, res) => {

    const { hospitalIds, lat, lon } = req.body;

    if (!hospitalIds || !Array.isArray(hospitalIds) || hospitalIds.length === 0) {
        return res.status(400).json({ error: 'hospitalIds must be a non-empty array.' });
    }

    if (hospitalIds.length > 10) {
        return res.status(400).json({ error: 'You can compare at most 10 hospitals at a time.' });
    }

    const hasLocation = lat !== undefined && lat !== null &&
                        lon !== undefined && lon !== null &&
                        !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lon));
    const userLocation = hasLocation
        ? `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`
        : null;

    try {

        const distanceCols = hasLocation
            ? `ROUND((ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2) AS distance_km,
               GREATEST(5, ROUND(((ST_DistanceSphere(h.geom, ${userLocation}) / 1000) / ${REALISTIC_AVERAGE_SPEED_KMH}) * 60)) AS travel_time_minutes,`
            : `NULL::numeric AS distance_km,
               NULL::numeric AS travel_time_minutes,`;

        const query = `
            SELECT
                h.hospital_id,
                h.name,
                h.address,
                h.phone,
                ST_X(h.geom) AS lon,
                ST_Y(h.geom) AS lat,

                ${distanceCols}

                hm.total_beds,
                hm.available_beds,
                hm.icu_beds,
                hm.ventilators,
                hm.emergency_level,
                hm.ambulance_available,
                hm.avg_wait_time_minutes,
                hm.patients_waiting,
                hm.cost_level,
                hm.hospital_rating,
                hm.ct_scan,
                hm.mri,
                hm.pharmacy,
                hm.blood_bank,
                hm.wheelchair_access,
                hm.parking_available

            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id

            WHERE h.hospital_id = ANY($1)
            ORDER BY ${hasLocation ? 'distance_km ASC' : 'h.hospital_id ASC'};
        `;

        const { rows } = await db.query(query, [hospitalIds]);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error comparing hospitals:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }

};


// ----------------------------
// GET /api/tradeoff-data
// ----------------------------

exports.getTradeoffData = async (req, res) => {

    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'lat and lon are required.' });
    }

    const userLocation =
        `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

    try {

        const query = `
            SELECT
                h.hospital_id,
                h.name,
                ST_X(h.geom) AS lon,
                ST_Y(h.geom) AS lat,

                hm.avg_wait_time_minutes,
                hm.available_beds,
                hm.hospital_rating,
                hm.cost_level,
                hm.emergency_level,

                ROUND(
                    (ST_DistanceSphere(h.geom, ${userLocation}) / 1000)::numeric, 2
                ) AS distance_km

            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id

            ORDER BY distance_km ASC;
        `;

        const { rows } = await db.query(query);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error fetching trade-off data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }

};


// ----------------------------
// GET /api/hospital-load
// ----------------------------

exports.getHospitalLoadStatus = async (req, res) => {

    try {

        const query = `
            SELECT
                h.hospital_id,
                h.name,

                hm.available_beds,
                hm.total_beds,

                CASE
                    WHEN hm.available_beds > hm.total_beds * 0.40 THEN 'green'
                    WHEN hm.available_beds > hm.total_beds * 0.15 THEN 'yellow'
                    ELSE 'red'
                END AS load_status,

                ROUND(
                    (hm.available_beds::numeric / NULLIF(hm.total_beds, 0)) * 100, 1
                ) AS occupancy_percent

            FROM hospitals h
            JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id

            ORDER BY h.hospital_id;
        `;

        const { rows } = await db.query(query);
        res.status(200).json(rows);

    } catch (err) {
        console.error('Error fetching hospital load status:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }

};