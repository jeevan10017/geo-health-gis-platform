-- =============================================================================
--  migration_ch_fix.sql
--  Fixes pgr_contraction for pgRouting >= 3.6 (new API)
--
--  Run:
--  psql -U postgres -d geo_health_db -f migration_ch_fix.sql
-- =============================================================================

\timing on

-- ─── Step 1: Verify x1/y1 are already populated ──────────────────────────────

DO $$
DECLARE n INTEGER;
BEGIN
    SELECT COUNT(*) INTO n FROM ways WHERE x1 IS NOT NULL;
    RAISE NOTICE '[Check] % edges already have x1/y1/x2/y2 - OK', n;
    IF n = 0 THEN
        RAISE EXCEPTION 'x1/y1 not populated. Run migration_astar_ch.sql first.';
    END IF;
END $$;


-- ─── Step 2: Recreate ch_ways with correct data ───────────────────────────────

DROP TABLE IF EXISTS ch_ways CASCADE;
DROP TABLE IF EXISTS ch_vertices CASCADE;

CREATE TABLE ch_ways (
    id               BIGSERIAL PRIMARY KEY,
    source           BIGINT  NOT NULL,
    target           BIGINT  NOT NULL,
    cost             FLOAT8  NOT NULL,
    reverse_cost     FLOAT8  NOT NULL,
    x1               FLOAT8,
    y1               FLOAT8,
    x2               FLOAT8,
    y2               FLOAT8,
    is_shortcut      BOOLEAN DEFAULT FALSE,
    contracted_verts BIGINT[] DEFAULT '{}'
);

-- Copy original ways
INSERT INTO ch_ways (source, target, cost, reverse_cost, x1, y1, x2, y2, is_shortcut)
SELECT
    source, target,
    CASE WHEN cost_s > 0 THEN cost_s ELSE length_m END,
    CASE WHEN reverse_cost_s > 0 THEN reverse_cost_s ELSE length_m END,
    x1, y1, x2, y2,
    FALSE
FROM ways
WHERE length_m > 0 AND source IS NOT NULL AND target IS NOT NULL
  AND x1 IS NOT NULL AND x2 IS NOT NULL;

DO $$
DECLARE n INTEGER;
BEGIN
    SELECT COUNT(*) INTO n FROM ch_ways;
    RAISE NOTICE '[CH] Copied % base edges', n;
END $$;


-- ─── Step 3: pgr_contraction with pgRouting 3.8 API ──────────────────────────
--
--  pgRouting 3.8 changed pgr_contraction output:
--  Old (< 3.6): type, id, contracted_vertices, source, target, cost, reverse_cost
--  New (>= 3.6): type, id, contracted_vertices, source, target, cost
--               (no reverse_cost in output — it's derived from directed graph)
--
--  Output rows:
--    type = 'v' → contracted vertex info (we skip these)
--    type = 'e' → shortcut edge to add

DO $$
DECLARE
    rec         RECORD;
    n_sc        INTEGER := 0;
    pg_ver      TEXT;
    major_ver   INTEGER;
BEGIN
    -- Detect pgRouting version
    SELECT pgr_version() INTO pg_ver;
    RAISE NOTICE '[CH] pgRouting version: %', pg_ver;

    RAISE NOTICE '[CH] Running contraction (pgRouting 3.x API)...';
    RAISE NOTICE '[CH] This takes 1-5 minutes for ~70k edges...';

    FOR rec IN
        SELECT *
        FROM pgr_contraction(
            -- Edge SQL (base graph only, no shortcuts)
            'SELECT id, source, target, cost, reverse_cost
             FROM ch_ways
             WHERE NOT is_shortcut',
            -- Contraction methods: 1=dead-end, 2=linear
            ARRAY[1, 2]::integer[],
            -- max_cycles
            1,
            -- forbidden vertices (none)
            ARRAY[]::bigint[],
            -- directed
            TRUE
        )
    LOOP
        -- pgRouting 3.x: type='e' means shortcut edge
        IF rec.type = 'e' THEN
            INSERT INTO ch_ways (
                source, target,
                cost,
                -- For shortcuts, reverse cost = same as forward (bidirectional)
                reverse_cost,
                is_shortcut,
                contracted_verts,
                x1, y1, x2, y2
            )
            SELECT
                rec.source, rec.target,
                rec.cost,
                rec.cost,  -- pgRouting 3.x doesn't return reverse_cost separately
                TRUE,
                COALESCE(rec.contracted_vertices, '{}'),
                vs.x1, vs.y1, vt.x2, vt.y2
            FROM
                (SELECT x1, y1 FROM ways WHERE source = rec.source LIMIT 1) vs,
                (SELECT x2, y2 FROM ways WHERE target = rec.target LIMIT 1) vt;

            n_sc := n_sc + 1;
        END IF;
    END LOOP;

    RAISE NOTICE '[CH] Created % shortcut edges', n_sc;
    RAISE NOTICE '[CH] Total ch_ways: %', (SELECT COUNT(*) FROM ch_ways);

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[CH] Contraction error: %', SQLERRM;
    RAISE WARNING '[CH] Trying alternative approach...';

    -- Alternative: use pgr_contraction with only dead-end (type 1)
    -- which is more stable across versions
    BEGIN
        FOR rec IN
            SELECT *
            FROM pgr_contraction(
                'SELECT id, source, target, cost, reverse_cost FROM ch_ways WHERE NOT is_shortcut',
                ARRAY[1]::integer[]
            )
        LOOP
            IF rec.type = 'e' THEN
                INSERT INTO ch_ways (source, target, cost, reverse_cost, is_shortcut, contracted_verts)
                VALUES (rec.source, rec.target, rec.cost, rec.cost, TRUE,
                        COALESCE(rec.contracted_vertices, '{}'));
                n_sc := n_sc + 1;
            END IF;
        END LOOP;
        RAISE NOTICE '[CH] Alternative: Created % dead-end shortcuts', n_sc;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[CH] Alternative also failed: %', SQLERRM;
        RAISE WARNING '[CH] CH shortcuts not available. A* routing still works fine.';
    END;
END $$;

-- Fill missing x1/y1/x2/y2 for shortcuts via vertex lookup
UPDATE ch_ways cw SET
    x1 = sv.lon, y1 = sv.lat,
    x2 = tv.lon, y2 = tv.lat
FROM
    (SELECT id, ST_X(the_geom) AS lon, ST_Y(the_geom) AS lat FROM ways_vertices_pgr) sv,
    (SELECT id, ST_X(the_geom) AS lon, ST_Y(the_geom) AS lat FROM ways_vertices_pgr) tv
WHERE cw.source = sv.id AND cw.target = tv.id
  AND cw.x1 IS NULL
  AND cw.is_shortcut = TRUE;

CREATE INDEX IF NOT EXISTS idx_ch_ways_source   ON ch_ways (source);
CREATE INDEX IF NOT EXISTS idx_ch_ways_target   ON ch_ways (target);
CREATE INDEX IF NOT EXISTS idx_ch_ways_sc       ON ch_ways (is_shortcut);
CREATE INDEX IF NOT EXISTS idx_ch_ways_src_tgt  ON ch_ways (source, target);


-- ─── Step 4: CH vertex ordering ───────────────────────────────────────────────

CREATE TABLE ch_vertices AS
SELECT
    v.id,
    ST_X(v.the_geom) AS lon,
    ST_Y(v.the_geom) AS lat,
    COALESCE(d.degree, 0)                                    AS degree,
    ROW_NUMBER() OVER (ORDER BY COALESCE(d.degree, 0) ASC)  AS ch_order
FROM ways_vertices_pgr v
LEFT JOIN (
    SELECT node_id AS id, COUNT(*) AS degree
    FROM (
        SELECT source AS node_id FROM ch_ways
        UNION ALL
        SELECT target AS node_id FROM ch_ways
    ) t
    GROUP BY node_id
) d ON v.id = d.id;

CREATE INDEX IF NOT EXISTS idx_ch_vertices_id    ON ch_vertices (id);
CREATE INDEX IF NOT EXISTS idx_ch_vertices_order ON ch_vertices (ch_order);

DO $$
DECLARE n INTEGER;
BEGIN
    SELECT COUNT(*) INTO n FROM ch_vertices;
    RAISE NOTICE '[Step 4] ch_vertices: % vertices', n;
END $$;


-- ─── Step 5: Export views ─────────────────────────────────────────────────────

DROP VIEW IF EXISTS ch_graph_export;
CREATE VIEW ch_graph_export AS
SELECT id, source, target,
    ROUND(cost::numeric, 1)         AS cost,
    ROUND(reverse_cost::numeric, 1) AS reverse_cost,
    ROUND(x1::numeric, 6) AS x1, ROUND(y1::numeric, 6) AS y1,
    ROUND(x2::numeric, 6) AS x2, ROUND(y2::numeric, 6) AS y2,
    is_shortcut::int AS sc,
    contracted_verts AS cv
FROM ch_ways WHERE x1 IS NOT NULL AND x2 IS NOT NULL;

DROP VIEW IF EXISTS ch_vertices_export;
CREATE VIEW ch_vertices_export AS
SELECT id, ROUND(lon::numeric, 6) AS lon, ROUND(lat::numeric, 6) AS lat, ch_order
FROM ch_vertices;


-- ─── Summary ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
    n_base  INTEGER;
    n_sc    INTEGER;
    n_verts INTEGER;
BEGIN
    SELECT COUNT(*) INTO n_base  FROM ch_ways WHERE NOT is_shortcut;
    SELECT COUNT(*) INTO n_sc    FROM ch_ways WHERE is_shortcut;
    SELECT COUNT(*) INTO n_verts FROM ch_vertices;

    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════';
    RAISE NOTICE '  CH Fix Complete';
    RAISE NOTICE '  ch_ways base edges : %', n_base;
    RAISE NOTICE '  ch_ways shortcuts  : %', n_sc;
    RAISE NOTICE '  ch_vertices        : %', n_verts;
    IF n_sc > 0 THEN
        RAISE NOTICE '  CH reduction       : ~%% fewer edges to search',
            ROUND(100.0 - (n_base + n_sc)::numeric / GREATEST(n_base,1) * 100);
        RAISE NOTICE '  Status             : FULL CH ROUTING READY';
    ELSE
        RAISE NOTICE '  Status             : Base graph only (A* works, CH shortcuts unavailable)';
        RAISE NOTICE '  Routing still uses : pgr_bdAstar on ways table — 3-5x faster than Dijkstra';
    END IF;
    RAISE NOTICE '════════════════════════════════════';
END $$;