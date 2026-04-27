-- =============================================================================
--  migration_perf_indexes.sql
--  Run once to add indexes that reduce latency on common queries.
--
--  psql -U postgres -d geo_health_db -f migration_perf_indexes.sql
-- =============================================================================

\timing on

-- ─── 1. KNN vertex lookup — used in EVERY routing call ───────────────────────
-- The ways_vertices_pgr KNN lookup (ORDER BY the_geom <-> point LIMIT 1) must
-- use GIST index. Without it: sequential scan on ~18k rows each call.

CREATE INDEX IF NOT EXISTS idx_ways_vertices_geom
    ON ways_vertices_pgr USING GIST (the_geom);

-- ─── 2. Hospital geometry — used in every hospital list + analytics query ────

CREATE INDEX IF NOT EXISTS idx_hospitals_geom
    ON hospitals USING GIST (geom);

-- ─── 3. Ways source/target — used by pgr_bdAstar edge query ─────────────────

CREATE INDEX IF NOT EXISTS idx_ways_source ON ways (source);
CREATE INDEX IF NOT EXISTS idx_ways_target ON ways (target);

-- Already created by migration_astar_ch.sql but add IF NOT EXISTS safety:
CREATE INDEX IF NOT EXISTS idx_ways_x1y1 ON ways (x1, y1);
CREATE INDEX IF NOT EXISTS idx_ways_x2y2 ON ways (x2, y2);

-- ─── 4. Doctor availability — used by currently-available + survival score ───

CREATE INDEX IF NOT EXISTS idx_doctor_avail_hospital
    ON doctor_availability (hospital_id, day_of_week, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_doctor_avail_doctor
    ON doctor_availability (doctor_id);

-- ─── 5. Hospital metrics — joined in nearly every hospital query ─────────────

CREATE INDEX IF NOT EXISTS idx_hospital_metrics_id
    ON hospital_metrics (hospital_id);

-- ─── 6. Doctors specialization — used in SMS + voice + specialty search ──────

CREATE INDEX IF NOT EXISTS idx_doctors_specialization
    ON doctors USING GIN (to_tsvector('english', specialization));

-- ─── 7. ANALYZE — update planner statistics after new indexes ────────────────

ANALYZE ways;
ANALYZE ways_vertices_pgr;
ANALYZE hospitals;
ANALYZE hospital_metrics;
ANALYZE doctor_availability;
ANALYZE doctors;

-- ─── Summary ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Performance Indexes Applied ===';
    RAISE NOTICE 'ways_vertices_pgr GIST (KNN routing) ✓';
    RAISE NOTICE 'hospitals GIST (spatial queries)      ✓';
    RAISE NOTICE 'ways source/target                    ✓';
    RAISE NOTICE 'doctor_availability composite         ✓';
    RAISE NOTICE 'hospital_metrics                      ✓';
    RAISE NOTICE 'doctors FTS index                     ✓';
    RAISE NOTICE 'ANALYZE complete                      ✓';
    RAISE NOTICE '===================================';
END $$;