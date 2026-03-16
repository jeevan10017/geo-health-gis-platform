
const db = require('../db');

// ─────────────────────────────────────────────
//  GET /api/debug/network-check?lat=&lon=
// ─────────────────────────────────────────────

exports.networkCheck = async (req, res) => {
    const { lat, lon } = req.query;
    const report = {};

    try {
        const hCount = await db.query('SELECT COUNT(*) AS n FROM hospitals');
        report.hospitals_total = parseInt(hCount.rows[0].n);

        const vCount = await db.query('SELECT COUNT(*) AS n FROM ways_vertices_pgr');
        report.road_nodes_total = parseInt(vCount.rows[0].n);

        const wCount = await db.query('SELECT COUNT(*) AS n FROM ways');
        report.road_edges_total = parseInt(wCount.rows[0].n);

        const mCount = await db.query('SELECT COUNT(*) AS n FROM hospital_metrics');
        report.hospital_metrics_total = parseInt(mCount.rows[0].n);

        // Check cost_s column
        try {
            const cs = await db.query(
                'SELECT COUNT(*) AS n FROM ways WHERE cost_s IS NOT NULL AND cost_s > 0'
            );
            report.edges_with_time_cost = parseInt(cs.rows[0].n);
        } catch {
            report.edges_with_time_cost = 'column missing — run migration_time_routing.sql';
        }

        if (lat && lon) {
            const userPoint = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;

            const nearestNode = await db.query(
                `SELECT id, ST_DistanceSphere(the_geom, ${userPoint}) AS dist_m
                 FROM ways_vertices_pgr
                 ORDER BY the_geom <-> ${userPoint}
                 LIMIT 1`
            );
            report.nearest_node_to_user = nearestNode.rows[0] ?? null;

            const firstHosp = await db.query(
                'SELECT hospital_id, name, geom FROM hospitals LIMIT 1'
            );

            if (firstHosp.rows.length > 0) {
                const h = firstHosp.rows[0];
                report.first_hospital = { hospital_id: h.hospital_id, name: h.name };

                const nearestHospNode = await db.query(
                    `SELECT id FROM ways_vertices_pgr
                     ORDER BY the_geom <-> '${h.geom}'::geometry
                     LIMIT 1`
                );
                report.nearest_node_to_first_hospital = nearestHospNode.rows[0] ?? null;

                if (report.nearest_node_to_user && report.nearest_node_to_first_hospital) {
                    try {
                        const dijkstra = await db.query(
                            `SELECT SUM(cost) AS total_cost
                             FROM pgr_dijkstra(
                                 'SELECT gid AS id, source, target, length_m AS cost FROM ways',
                                 ${report.nearest_node_to_user.id},
                                 ${report.nearest_node_to_first_hospital.id},
                                 false
                             )`
                        );
                        report.dijkstra_test = dijkstra.rows[0] ?? null;
                    } catch (err) {
                        report.dijkstra_error = err.message;
                    }
                }
            }
        }

        const sample = await db.query(
            `SELECT hospital_id, name, ST_X(geom) AS lon, ST_Y(geom) AS lat
             FROM hospitals LIMIT 3`
        );
        report.sample_hospitals = sample.rows;

        res.status(200).json(report);

    } catch (err) {
        res.status(500).json({ error: err.message, partial_report: report });
    }
};


// ─────────────────────────────────────────────
//  GET /api/debug/ors-test
//  Quick connectivity test for ORS API key
// ─────────────────────────────────────────────

exports.orsTest = async (req, res) => {
    const axios  = require('axios');
    const apiKey = process.env.ORS_API_KEY;

    const report = {
        key_present: !!apiKey,
        key_prefix:  apiKey ? apiKey.slice(0, 8) + '...' : null,
        node_version: process.version,
    };

    if (!apiKey) {
        return res.status(200).json({
            ...report,
            status: 'FAIL',
            reason: 'ORS_API_KEY not found in .env — add ORS_API_KEY=your_key and restart server',
        });
    }

    try {
        // Test: KGP → Midnapore
        const orsRes = await axios.post(
            'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
            { coordinates: [[87.3147, 22.3276], [87.3224, 22.4246]] },
            {
                headers: {
                    'Authorization': apiKey,
                    'Content-Type':  'application/json',
                },
                timeout: 10000,
            }
        );

        const feat = orsRes.data.features?.[0];
        report.status          = 'OK';
        report.http_status     = orsRes.status;
        report.test_distance_m = Math.round(feat?.properties?.summary?.distance ?? 0);
        report.test_time_min   = Math.round((feat?.properties?.summary?.duration ?? 0) / 60);
        report.has_steps       = (feat?.properties?.segments?.[0]?.steps?.length ?? 0) > 0;

    } catch (err) {
        report.status     = 'FAIL';
        report.http_status = err.response?.status;
        report.reason      = err.response?.data?.error?.message
                          ?? err.response?.data?.message
                          ?? err.message;
    }

    res.status(200).json(report);
};