
const db   = require('../db');
const https = require('https');

// ─────────────────────────────────────────────
//  GET /api/debug/network-check?lat=&lon=
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  GET /api/debug/db-test
//  Tests the DB connection from Vercel → GCP VM.
//  Shows exact error so you can diagnose firewall/config issues.
// ─────────────────────────────────────────────

exports.dbTest = async (req, res) => {
    const report = {
        db_host:     process.env.DB_HOST     || 'not set',
        db_port:     process.env.DB_PORT     || 'not set',
        db_database: process.env.DB_DATABASE || 'not set',
        db_user:     process.env.DB_USER     || 'not set',
        db_password: process.env.DB_PASSWORD ? '*** set ***' : 'NOT SET',
    };

    try {
        const start = Date.now();
        const result = await db.query('SELECT COUNT(*) AS hospitals FROM hospitals');
        report.status         = 'CONNECTED';
        report.hospitals      = result.rows[0].hospitals;
        report.latency_ms     = Date.now() - start;
    } catch (err) {
        report.status         = 'FAILED';
        report.error_message  = err.message;
        report.error_code     = err.code;
        // Common codes:
        // ECONNREFUSED  → port 5432 not open / VM stopped
        // ECONNABORTED  → timeout — VM is starting up or firewall blocking
        // 3D000         → database does not exist
        // 28P01         → wrong password
        report.hint = {
            ECONNREFUSED: 'VM stopped or port 5432 firewall not open',
            ECONNABORTED: 'VM starting up or GCP firewall blocking port 5432',
            ETIMEDOUT:    'VM stopped or GCP firewall blocking port 5432',
            '3D000':      'Database geo_health_db does not exist — run schema.sql',
            '28P01':      'Wrong DB_PASSWORD in Vercel env vars',
        }[err.code] || 'Check GCP firewall and VM status';
    }

    res.status(200).json(report);
};


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

// ─────────────────────────────────────────────
//  GET /api/debug/db-check
//  Raw connection test — shows exact error if GCP is unreachable
// ─────────────────────────────────────────────

exports.dbCheck = async (req, res) => {
    const { Client } = require('pg');
    const config = {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_DATABASE || 'geo_health_db',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || 'Password123',
        connectionTimeoutMillis: 8000,
    };

    const report = {
        db_host:     config.host,
        db_port:     config.port,
        db_database: config.database,
        db_user:     config.user,
        node_env:    process.env.NODE_ENV,
    };

    const client = new Client(config);
    try {
        await client.connect();
        const r = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM hospitals)  AS hospitals,
                (SELECT COUNT(*) FROM ways WHERE length_m IS NOT NULL) AS road_edges,
                NOW() AS db_time
        `);
        await client.end();
        report.status    = 'OK';
        report.hospitals = r.rows[0].hospitals;
        report.road_edges = r.rows[0].road_edges;
        report.db_time   = r.rows[0].db_time;
    } catch (err) {
        try { await client.end(); } catch (_) {}
        report.status = 'FAIL';
        report.error  = err.message;
        report.code   = err.code;
        report.hint   = err.code === 'ECONNREFUSED'  ? 'VM is stopped or port 5432 not open in GCP firewall' :
                        err.code === 'ETIMEDOUT'      ? 'VM is running but port 5432 blocked by GCP firewall' :
                        err.code === '28P01'           ? 'Wrong DB_PASSWORD' :
                        err.code === '3D000'           ? 'Wrong DB_DATABASE name' :
                        'Check all DB_* env vars in Vercel dashboard';
    }
    res.status(200).json(report);
};


exports.orsTest = async (req, res) => {
    const https  = require('https');
    const apiKey = process.env.ORS_API_KEY;

    const report = {
        key_present:  !!apiKey,
        key_prefix:   apiKey ? apiKey.slice(0, 8) + '...' : null,
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
        const body = JSON.stringify({
            coordinates: [[87.3147, 22.3276], [87.3224, 22.4246]],
        });

        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openrouteservice.org',
                path:     '/v2/directions/driving-car/geojson',
                method:   'POST',
                headers:  {
                    'Authorization': apiKey,
                    'Content-Type':  'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: 10000,
            };

            const req = https.request(options, (resp) => {
                let data = '';
                resp.on('data', chunk => { data += chunk; });
                resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
            req.write(body);
            req.end();
        });

        if (result.status !== 200) {
            let errMsg = result.body;
            try { errMsg = JSON.parse(result.body)?.error?.message ?? errMsg; } catch (_) {}
            report.status     = 'FAIL';
            report.http_status = result.status;
            report.reason      = errMsg;
            return res.status(200).json(report);
        }

        const data = JSON.parse(result.body);
        const feat = data.features?.[0];
        report.status          = 'OK';
        report.http_status     = 200;
        report.test_distance_m = Math.round(feat?.properties?.summary?.distance ?? 0);
        report.test_time_min   = Math.round((feat?.properties?.summary?.duration ?? 0) / 60);
        report.has_steps       = (feat?.properties?.segments?.[0]?.steps?.length ?? 0) > 0;

    } catch (err) {
        report.status = 'FAIL';
        report.reason = err.message;
    }

    res.status(200).json(report);
};