
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;


-- ─────────────────────────────────────────────
--  Drop existing tables (safe teardown order)
-- ─────────────────────────────────────────────

DROP TABLE IF EXISTS hospital_metrics    CASCADE;
DROP TABLE IF EXISTS doctor_availability CASCADE;
DROP TABLE IF EXISTS doctors             CASCADE;
DROP TABLE IF EXISTS hospitals           CASCADE;


-- ─────────────────────────────────────────────
--  Core tables
-- ─────────────────────────────────────────────

CREATE TABLE hospitals (
    hospital_id  SERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    address      TEXT,
    phone        VARCHAR(20),
    pincode      VARCHAR(10),
    website_link VARCHAR(255),
    geom         GEOMETRY(Point, 4326)
);

CREATE TABLE doctors (
    doctor_id      SERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    specialization VARCHAR(100) NOT NULL
);

CREATE TABLE doctor_availability (
    availability_id SERIAL PRIMARY KEY,
    doctor_id       INTEGER  NOT NULL REFERENCES doctors(doctor_id)   ON DELETE CASCADE,
    hospital_id     INTEGER  NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- ISO: 1=Mon … 7=Sun
    start_time      TIME     NOT NULL,
    end_time        TIME     NOT NULL
);


-- ─────────────────────────────────────────────
--  Hospital metrics (one row per hospital)
-- ─────────────────────────────────────────────

CREATE TABLE hospital_metrics (
    hospital_id INTEGER PRIMARY KEY REFERENCES hospitals(hospital_id) ON DELETE CASCADE,

    -- Capacity
    total_beds      INTEGER,
    available_beds  INTEGER,
    icu_beds        INTEGER,
    ventilators     INTEGER,

    -- Emergency capability
    emergency_level     SMALLINT,   -- 1 = basic | 2 = moderate | 3 = trauma centre
    ambulance_available BOOLEAN,

    -- Operational
    avg_wait_time_minutes INTEGER,
    patients_waiting      INTEGER,

    -- Economic
    cost_level SMALLINT,            -- 1 = low / govt | 2 = medium | 3 = high / private

    -- Quality
    hospital_rating NUMERIC(2, 1),  -- e.g. 4.2

    -- Infrastructure
    ct_scan    BOOLEAN,
    mri        BOOLEAN,
    pharmacy   BOOLEAN,
    blood_bank BOOLEAN,

    -- Accessibility
    wheelchair_access  BOOLEAN,
    parking_available  BOOLEAN
);


-- ─────────────────────────────────────────────
--  Indexes
-- ─────────────────────────────────────────────

CREATE INDEX hospitals_geom_idx ON hospitals USING GIST (geom);