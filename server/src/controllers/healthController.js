const db = require('../db');
const { formatToGeoJSON } = require('../utils/spatialHelpers');

/**
 * @description Get all hospitals and return them in GeoJSON format.
 */
exports.getAllHospitals = async (req, res) => {
  try {
    const query = `
      SELECT
        h.hospital_id,
        h.name,
        h.address,
        -- Convert the geometry to a GeoJSON string
        ST_AsGeoJSON(h.geom) AS geometry
      FROM hospitals h;
    `;
    const { rows } = await db.query(query); 
    // Use a helper function to format the flat list into a valid GeoJSON FeatureCollection
    const geoJson = formatToGeoJSON(rows);
    res.status(200).json(geoJson);
  } catch (err) {
    console.error('Error fetching hospitals:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * @description Find the nearest available doctors based on user location and specialization.
 */
exports.findNearestDoctors = async (req, res) => {
  const { lat, lon, specialization } = req.query;

  // Basic validation
  if (!lat || !lon || !specialization) {
    return res.status(400).json({ error: 'Latitude, longitude, and specialization are required.' });
  }

  try {
    // This is a multi-step query to find the nearest available doctor by road network distance.
    // 1. Find doctors of the required specialization who are available right now.
    // 2. Get the unique hospitals where they work.
    // 3. Use pgRouting (pgr_dijkstra) to calculate the shortest path from the user's location
    //    to each of these candidate hospitals.
    // 4. Order the results by distance and return the closest ones.

    const query = `
        WITH AvailableDoctors AS (
            -- Step 1: Find available doctors of the given specialization
            SELECT DISTINCT
                da.hospital_id,
                d.name AS doctor_name,
                d.specialization
            FROM doctors d
            JOIN doctor_availability da ON d.doctor_id = da.doctor_id
            WHERE
                d.specialization ILIKE $1
                AND da.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE) -- Check for today's day of week
                AND CURRENT_TIME BETWEEN da.start_time AND da.end_time -- Check for current time
        ),
        CandidateHospitals AS (
            -- Step 2: Get the locations of the hospitals where these doctors work
            SELECT
                h.hospital_id,
                h.name AS hospital_name,
                h.address,
                h.geom,
                -- Find the closest node on the road network to each hospital
                (SELECT id FROM roads_vertices_pgr ORDER BY the_geom <-> h.geom LIMIT 1) AS hospital_node
            FROM hospitals h
            WHERE h.hospital_id IN (SELECT hospital_id FROM AvailableDoctors)
        )
        -- Step 3: Calculate shortest path from user to each candidate hospital
        SELECT
            ch.hospital_name,
            ch.address,
            -- Aggregate all available doctors at that hospital
            array_agg(ad.doctor_name) as available_doctors,
            -- The aggregated cost from pgr_dijkstra is the distance in meters
            pgr.agg_cost AS distance_in_meters
        FROM pgr_dijkstra(
            'SELECT gid AS id, source, target, length_m AS cost FROM roads',
            -- Find the closest road network node to the user's location
            (SELECT id FROM roads_vertices_pgr ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint($3, $2), 4326) LIMIT 1),
            -- An array of all candidate hospital nodes
            (SELECT array_agg(hospital_node) FROM CandidateHospitals),
            false -- Use an undirected graph (roads go both ways)
        ) AS pgr
        JOIN CandidateHospitals ch ON pgr.end_vid = ch.hospital_node
        JOIN AvailableDoctors ad ON ch.hospital_id = ad.hospital_id
        GROUP BY ch.hospital_name, ch.address, pgr.agg_cost
        ORDER BY distance_in_meters ASC -- Step 4: Order by distance
        LIMIT 5; -- Return the top 5 closest results
    `;

    const { rows } = await db.query(query, [`%${specialization}%`, parseFloat(lat), parseFloat(lon)]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No available doctors found matching your criteria.' });
    }
    
    res.status(200).json(rows);
  } catch (err) {
    console.error('Error finding nearest doctors:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};