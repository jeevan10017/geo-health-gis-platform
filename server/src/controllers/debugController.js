

const db = require('../db');

/**
 * GET /api/debug/network-check?lat=&lon=
 *
 * Checks every layer the hospitals query depends on and returns a JSON
 * report so you can see exactly which layer is broken.
 */
exports.networkCheck = async (req, res) => {
    const { lat, lon } = req.query;
    const report = {};

    try {
        // 1 — Are there any hospitals at all?
        const hCount = await db.query('SELECT COUNT(*) AS n FROM hospitals');
        report.hospitals_total = parseInt(hCount.rows[0].n);

        // 2 — Are there any road-network nodes?
        const vCount = await db.query(
            'SELECT COUNT(*) AS n FROM ways_vertices_pgr'
        );
        report.road_nodes_total = parseInt(vCount.rows[0].n);

        // 3 — Are there any road edges?
        const wCount = await db.query('SELECT COUNT(*) AS n FROM ways');
        report.road_edges_total = parseInt(wCount.rows[0].n);

        // 4 — Are there any hospital_metrics rows?
        const mCount = await db.query(
            'SELECT COUNT(*) AS n FROM hospital_metrics'
        );
        report.hospital_metrics_total = parseInt(mCount.rows[0].n);

        // 5 — Can we find the nearest node to the user's location?
        if (lat && lon) {
            const userPoint = `ST_SetSRID(ST_MakePoint(${parseFloat(lon)}, ${parseFloat(lat)}), 4326)`;
            const nearestNode = await db.query(
                `SELECT id, ST_DistanceSphere(the_geom, ${userPoint}) AS dist_m
                 FROM ways_vertices_pgr
                 ORDER BY the_geom <-> ${userPoint}
                 LIMIT 1`
            );
            report.nearest_node_to_user = nearestNode.rows[0] ?? null;

            // 6 — Nearest node to first hospital
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

                // 7 — Try one Dijkstra call between those two nodes
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

        // 8 — Sample the first 3 hospital rows (straight-line, no routing)
        const sample = await db.query(
            `SELECT hospital_id, name,
                    ST_X(geom) AS lon, ST_Y(geom) AS lat
             FROM hospitals
             LIMIT 3`
        );
        report.sample_hospitals = sample.rows;

        res.status(200).json(report);

    } catch (err) {
        res.status(500).json({ error: err.message, partial_report: report });
    }
};