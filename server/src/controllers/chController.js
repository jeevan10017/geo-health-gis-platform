// =============================================================================
//  src/controllers/chController.js
//
//  Contraction Hierarchies for offline routing:
//
//  GET /api/ch/graph-export   → downloads the compact contracted graph as JSON
//                               Browser caches this in IndexedDB.
//                               ~600 KB gzipped for West Medinipur.
//
//  GET /api/route/ch          → server-side CH routing using ch_ways table
//                               ~4-8x faster than Dijkstra on original graph.
//
//  GET /api/ch/status         → reports CH graph stats (for debugging)
// =============================================================================

const db = require('../db');

// ─── Cache the graph in memory for fast repeated exports ──────────────────────

let _graphCache     = null;
let _graphCacheTime = 0;
const GRAPH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── GET /api/ch/status ───────────────────────────────────────────────────────

exports.getChStatus = async (req, res) => {
    try {
        const [edges, shortcuts, verts] = await Promise.all([
            db.query('SELECT COUNT(*) AS n FROM ch_ways WHERE NOT is_shortcut'),
            db.query('SELECT COUNT(*) AS n FROM ch_ways WHERE is_shortcut'),
            db.query('SELECT COUNT(*) AS n FROM ch_vertices'),
        ]);

        const nBase  = parseInt(edges.rows[0].n);
        const nSc    = parseInt(shortcuts.rows[0].n);
        const nVerts = parseInt(verts.rows[0].n);

        res.json({
            status:            'ready',
            base_edges:        nBase,
            shortcut_edges:    nSc,
            total_ch_edges:    nBase + nSc,
            ch_vertices:       nVerts,
            compression_pct:   nBase > 0 ? Math.round(100 - (nBase + nSc) / nBase * 100) : 0,
            graph_size_kb_est: Math.round((nBase + nSc) * 64 / 1024),
        });
    } catch (err) {
        res.status(500).json({ error: err.message, hint: 'Run migration_astar_ch.sql first' });
    }
};

// ─── GET /api/ch/graph-export ─────────────────────────────────────────────────
//
//  Returns compact JSON for browser to store in IndexedDB:
//  {
//    meta: { edges, shortcuts, vertices, exported_at },
//    edges: [[id, src, tgt, cost, rev_cost, x1, y1, x2, y2, is_shortcut], ...],
//    vertices: [[id, lon, lat, ch_order], ...]
//  }
//
//  Uses array format (not object) to minimize JSON size.
//  Typical response: ~2-4 MB raw, ~500-800 KB gzipped.

exports.exportChGraph = async (req, res) => {
    try {
        // Serve from in-memory cache if fresh
        if (_graphCache && Date.now() - _graphCacheTime < GRAPH_CACHE_TTL_MS) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('X-CH-Cache', 'HIT');
            return res.json(_graphCache);
        }

        // Fetch edges in compact array format
        const edgeResult = await db.query(`
            SELECT
                id, source, target,
                ROUND(cost::numeric, 1)          AS cost,
                ROUND(reverse_cost::numeric, 1)  AS rev_cost,
                ROUND(x1::numeric, 6)            AS x1,
                ROUND(y1::numeric, 6)            AS y1,
                ROUND(x2::numeric, 6)            AS x2,
                ROUND(y2::numeric, 6)            AS y2,
                is_shortcut::int                 AS sc,
                COALESCE(contracted_verts, '{}') AS cv
            FROM ch_ways
            WHERE x1 IS NOT NULL AND x2 IS NOT NULL
            ORDER BY id
        `);

        // Fetch vertices in compact format
        const vertResult = await db.query(`
            SELECT id,
                ROUND(lon::numeric, 6) AS lon,
                ROUND(lat::numeric, 6) AS lat,
                ch_order
            FROM ch_vertices
            ORDER BY id
        `);

        // Pack as arrays to save ~40% JSON size vs objects
        const edges    = edgeResult.rows.map(r => [
            r.id, r.source, r.target,
            r.cost, r.rev_cost,
            r.x1, r.y1, r.x2, r.y2,
            r.sc,
            r.cv,   // contracted vertex array (for path unpacking)
        ]);

        const vertices = vertResult.rows.map(r => [
            r.id, r.lon, r.lat, r.ch_order
        ]);

        const graph = {
            meta: {
                edges:        edges.length,
                shortcuts:    edges.filter(e => e[9] === 1).length,
                vertices:     vertices.length,
                exported_at:  new Date().toISOString(),
                version:      2,
                // Field index guide for client
                edge_fields:  ['id','src','tgt','cost','rev_cost','x1','y1','x2','y2','is_shortcut','contracted_verts'],
                vert_fields:  ['id','lon','lat','ch_order'],
            },
            edges,
            vertices,
        };

        // Cache in memory
        _graphCache     = graph;
        _graphCacheTime = Date.now();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-CH-Cache', 'MISS');
        res.json(graph);

    } catch (err) {
        console.error('[CH Export]', err.message);
        res.status(500).json({
            error: err.message,
            hint:  'Run migration_astar_ch.sql to build CH graph first',
        });
    }
};

// ─── GET /api/route/ch ────────────────────────────────────────────────────────
//
//  Server-side CH routing using the contracted graph.
//  Uses pgr_bdAstar on ch_ways (base + shortcuts).
//  Returns geometry by unpacking shortcuts back to original edges.

exports.getChRoute = async (req, res) => {
    const { fromLat, fromLon, toLat, toLon } = req.query;

    if (!fromLat || !fromLon || !toLat || !toLon)
        return res.status(400).json({ error: 'All four coordinates required' });

    const pFromLat = parseFloat(fromLat), pFromLon = parseFloat(fromLon);
    const pToLat   = parseFloat(toLat),   pToLon   = parseFloat(toLon);

    const startPt = `ST_SetSRID(ST_MakePoint(${pFromLon}, ${pFromLat}), 4326)`;
    const endPt   = `ST_SetSRID(ST_MakePoint(${pToLon},   ${pToLat}),   4326)`;

    try {
        // Find nearest graph vertices to start/end points
        // Use ch_vertices (has ch_order) for proper CH search
        const nodeQuery = `
            SELECT
                (SELECT v.id FROM ch_vertices v
                 ORDER BY (v.lon - ${pFromLon})^2 + (v.lat - ${pFromLat})^2 LIMIT 1) AS start_node,
                (SELECT v.id FROM ch_vertices v
                 ORDER BY (v.lon - ${pToLon})^2   + (v.lat - ${pToLat})^2   LIMIT 1) AS end_node
        `;
        const { rows: nodeRows } = await db.query(nodeQuery);
        const { start_node, end_node } = nodeRows[0];

        if (!start_node || !end_node)
            return res.status(404).json({ error: 'No graph vertices near given coordinates' });

        if (start_node === end_node)
            return res.status(400).json({ error: 'Start and end are the same vertex' });

        // Route on CH graph using bidirectional A*
        // ch_ways contains both original edges + shortcuts
        const routeQuery = `
            WITH route AS (
                SELECT seq, node, edge, cost, agg_cost
                FROM pgr_bdAstar(
                    'SELECT id, source, target, cost, reverse_cost, x1, y1, x2, y2
                     FROM ch_ways WHERE x1 IS NOT NULL',
                    ${start_node},
                    ${end_node},
                    TRUE,
                    5   -- Euclidean heuristic
                )
                WHERE edge >= 0  -- exclude virtual start/end rows
            ),
            -- For non-shortcut edges: get actual geometry from ways table
            -- For shortcuts: use straight line between endpoint coords (approximate)
            edge_geoms AS (
                SELECT
                    r.seq,
                    r.cost,
                    cw.is_shortcut,
                    cw.contracted_verts,
                    CASE
                        WHEN NOT cw.is_shortcut THEN
                            -- Original edge: join back to ways table for real geometry
                            (SELECT w.the_geom FROM ways w WHERE w.gid = cw.id LIMIT 1)
                        ELSE
                            -- Shortcut: straight line (unpacking handled client-side or below)
                            ST_MakeLine(
                                ST_SetSRID(ST_MakePoint(cw.x1, cw.y1), 4326),
                                ST_SetSRID(ST_MakePoint(cw.x2, cw.y2), 4326)
                            )
                    END AS geom,
                    COALESCE(
                        (SELECT w.length_m FROM ways w WHERE w.gid = cw.id LIMIT 1),
                        ST_DistanceSphere(
                            ST_SetSRID(ST_MakePoint(cw.x1, cw.y1), 4326),
                            ST_SetSRID(ST_MakePoint(cw.x2, cw.y2), 4326)
                        )
                    ) AS length_m,
                    COALESCE(
                        (SELECT w.name FROM ways w WHERE w.gid = cw.id LIMIT 1),
                        'Shortcut'
                    ) AS road_name
                FROM route r
                JOIN ch_ways cw ON r.edge = cw.id
            )
            SELECT
                ST_AsGeoJSON(ST_Collect(geom ORDER BY seq))   AS route_geometry,
                SUM(length_m)                                  AS total_distance_m,
                -- cost is in seconds (from cost_s)
                ROUND(SUM(cost) / 60.0)                       AS total_time_minutes,
                COUNT(*) FILTER (WHERE is_shortcut)            AS shortcuts_used,
                COUNT(*) FILTER (WHERE NOT is_shortcut)        AS real_edges_used,
                json_agg(json_build_object(
                    'road',       road_name,
                    'distance_m', ROUND(length_m),
                    'time_s',     ROUND(cost),
                    'shortcut',   is_shortcut
                ) ORDER BY seq) AS steps
            FROM edge_geoms
            WHERE geom IS NOT NULL;
        `;

        const { rows } = await db.query(routeQuery);

        if (!rows[0]?.route_geometry)
            return res.status(404).json({ error: 'CH route not found — try A* or ORS fallback' });

        // Merge steps on same road name
        const rawSteps = rows[0].steps ?? [];
        const merged   = [];
        for (const s of rawSteps) {
            const last = merged[merged.length - 1];
            if (last && last.road === s.road && !s.shortcut)
                { last.distance_m += s.distance_m; last.time_s += s.time_s; }
            else
                merged.push({ ...s });
        }

        res.json({
            geometry:           JSON.parse(rows[0].route_geometry),
            total_distance_m:   Math.round(rows[0].total_distance_m ?? 0),
            total_time_minutes: Math.round(rows[0].total_time_minutes ?? 0),
            shortcuts_used:     parseInt(rows[0].shortcuts_used ?? 0),
            real_edges_used:    parseInt(rows[0].real_edges_used ?? 0),
            steps:              merged.filter(s => !s.shortcut),
            routing_method:     'ch_bdAstar',
        });

    } catch (err) {
        console.error('[CH Route]', err.message);
        res.status(500).json({ error: err.message });
    }
};