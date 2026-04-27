-- =============================================================================
--  seed_multiagent.sql
--  Adds ambulance locations and sample patient records for
--  the Multi-Agent Coordination system.
--
--  Run:
--  psql -U postgres -d geo_health_db -f seed_multiagent.sql
-- =============================================================================

-- ─── Ambulances table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ambulances (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    station_name    TEXT,
    lat             FLOAT8 NOT NULL,
    lon             FLOAT8 NOT NULL,
    geom            GEOMETRY(Point, 4326) GENERATED ALWAYS AS
                        (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
    available       BOOLEAN DEFAULT TRUE,
    speed_kmh       INT DEFAULT 60,
    capacity        INT DEFAULT 2,   -- patients per trip
    hospital_id     INT REFERENCES hospitals(hospital_id) ON DELETE SET NULL,
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ambulances (name, station_name, lat, lon, hospital_id) VALUES
-- Kharagpur area
('AMB-KGP-01', 'Kharagpur SDH Station',   22.3276, 87.3147, 6),
('AMB-KGP-02', 'BC Roy Campus Station',   22.3167, 87.3004, 14),
-- Midnapore
('AMB-MDP-01', 'Midnapore Medical Station', 22.4246, 87.3224, 7),
('AMB-MDP-02', 'Midnapore East Station',    22.4380, 87.3450, 7),
-- Ghatal area
('AMB-GHT-01', 'Ghatal SDH Station',       22.6570, 87.7379, 2),
-- Jhargram
('AMB-JHG-01', 'Jhargram District Station', 22.4476, 86.9984, 12),
-- Debra
('AMB-DBR-01', 'Debra Super Spec Station',  22.3828, 87.5619, 13),
-- Rural coverage
('AMB-SBN-01', 'Sabang Rural Station',      22.1803, 87.5929, 9),
('AMB-KSH-01', 'Keshiary Rural Station',    22.1277, 87.2283, 3),
('AMB-SLB-01', 'Salboni Station',           22.6406, 87.3152, 10);

CREATE INDEX IF NOT EXISTS idx_ambulances_geom ON ambulances USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_ambulances_available ON ambulances(available);


-- ─── Sample patients table (for simulation/demo) ─────────────────────────────

CREATE TABLE IF NOT EXISTS sample_patients (
    id              SERIAL PRIMARY KEY,
    label           TEXT,
    lat             FLOAT8 NOT NULL,
    lon             FLOAT8 NOT NULL,
    severity        INT CHECK (severity BETWEEN 1 AND 5) DEFAULT 3,
    emergency_type  TEXT DEFAULT 'general',
    scenario        TEXT  -- 'demo3', 'mass_casualty', 'rural_spread'
);

INSERT INTO sample_patients (label, lat, lon, severity, emergency_type, scenario) VALUES
-- Demo 3 patients
('P1-Heart', 22.3276, 87.3147, 4, 'heart_attack', 'demo3'),
('P2-Accident', 22.4246, 87.3224, 3, 'accident',   'demo3'),
('P3-Stroke', 22.6570, 87.7379,  5, 'stroke',      'demo3'),
-- Mass casualty
('MC-P1', 22.32, 87.31, 5, 'accident',     'mass_casualty'),
('MC-P2', 22.35, 87.34, 4, 'accident',     'mass_casualty'),
('MC-P3', 22.31, 87.29, 3, 'general',      'mass_casualty'),
('MC-P4', 22.65, 87.73, 4, 'heart_attack', 'mass_casualty'),
('MC-P5', 22.22, 87.13, 2, 'general',      'mass_casualty'),
-- Rural spread
('RS-P1', 22.12, 87.22, 4, 'pregnancy', 'rural_spread'),
('RS-P2', 21.95, 87.01, 3, 'general',   'rural_spread'),
('RS-P3', 22.73, 87.76, 5, 'stroke',    'rural_spread'),
('RS-P4', 22.55, 87.45, 3, 'accident',  'rural_spread');


-- ─── System metrics log (for comparing greedy vs Hungarian over time) ─────────

CREATE TABLE IF NOT EXISTS optimization_log (
    id               SERIAL PRIMARY KEY,
    run_at           TIMESTAMPTZ DEFAULT NOW(),
    n_patients       INT,
    n_hospitals_used INT,
    algorithm        TEXT,  -- 'hungarian', 'greedy'
    avg_eta_min      FLOAT8,
    load_balance_score FLOAT8,
    total_cost       FLOAT8
);


-- ─── Summary ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
    n_amb INT;
    n_pat INT;
BEGIN
    SELECT COUNT(*) INTO n_amb FROM ambulances;
    SELECT COUNT(*) INTO n_pat FROM sample_patients;
    RAISE NOTICE '';
    RAISE NOTICE '=== Multi-Agent Seed Complete ===';
    RAISE NOTICE '  Ambulances:      %', n_amb;
    RAISE NOTICE '  Sample patients: %', n_pat;
    RAISE NOTICE '=================================';
END $$;