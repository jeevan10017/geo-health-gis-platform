const db = require('../db');
/**
 * @description Search for hospitals. Can be filtered by a query string (q)
 * that matches hospital name, doctor name, or doctor specialization.
 * Always returns hospitals sorted by distance from the user.
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
 * @description Get available doctors and their schedules for a specific hospital on a given date.
 */
exports.getDoctorsByHospital = async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;
    
    // Default to today if no date is provided
    const searchDate = date ? new Date(date) : new Date();

    try {
        const query = `
            SELECT
                d.name,
                d.specialization,
                to_char(da.start_time, 'HH24:MI') as start_time,
                to_char(da.end_time, 'HH24:MI') as end_time
            FROM doctor_availability da
            JOIN doctors d ON da.doctor_id = d.doctor_id
            WHERE
                da.hospital_id = $1
                AND da.day_of_week = EXTRACT(ISODOW FROM $2::date)
            ORDER BY d.specialization, d.name;
        `;
        const { rows } = await db.query(query, [id, searchDate]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching doctors for hospital:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};