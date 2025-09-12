-- DESCRIPTION: Sets up the database schema for the Geo-Health project.
-- -----------------------------------------------------------------------------
-- EXTENSIONS
-- Enable PostGIS for spatial data types and functions (e.g., GEOMETRY, ST_MakePoint).
-- Enable pgRouting for shortest path algorithms (e.g., pgr_dijkstra).
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- -----------------------------------------------------------------------------
-- TABLES
-- We drop tables if they exist to ensure a clean setup from scratch.
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS doctor_availability CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS hospitals CASCADE;

--
-- Table: hospitals
-- Purpose: Stores information about hospitals and health centers, including their
-- geographic location and contact details.
--
CREATE TABLE hospitals (
    hospital_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    pincode VARCHAR(10),
    website_link VARCHAR(255),
    -- The 'geom' column stores the location as a point in the WGS 84 coordinate system (SRID 4326),
    -- which is the standard for GPS.
    geom GEOMETRY(Point, 4326)
);

--
-- Table: doctors
-- Purpose: Stores information about doctors and their specialization.
--
CREATE TABLE doctors (
    doctor_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    specialization VARCHAR(100) NOT NULL -- e.g., 'Cardiology', 'Pediatrics'
);

--
-- Table: doctor_availability
-- Purpose: A linking table that defines which doctor is available at which hospital,
-- on which day of the week, and during what times.
--
CREATE TABLE doctor_availability (
    availability_id SERIAL PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    hospital_id INTEGER NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    -- Day of the week is stored as an integer, following the ISO 8601 standard:
    -- 1 = Monday, 2 = Tuesday, ..., 7 = Sunday.
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

-- -----------------------------------------------------------------------------
-- INDEXES
-- Purpose: Speed up queries. A GIST index is crucial for spatial queries.
-- -----------------------------------------------------------------------------
CREATE INDEX hospitals_geom_idx ON hospitals USING GIST (geom);

-- Note: The 'roads' table and its 'roads_vertices_pgr' table for topology
-- will be created automatically by the 'osm2pgrouting' tool. They do not
-- need to be defined here.