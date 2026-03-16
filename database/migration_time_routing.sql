
-- 1. Add cost_s columns if they don't exist yet
ALTER TABLE ways ADD COLUMN IF NOT EXISTS cost_s           FLOAT;
ALTER TABLE ways ADD COLUMN IF NOT EXISTS reverse_cost_s   FLOAT;

-- 2. Add length_m if somehow missing (shouldn't happen)
ALTER TABLE ways ADD COLUMN IF NOT EXISTS length_m FLOAT;
UPDATE ways SET length_m = ST_Length(the_geom::geography) WHERE length_m IS NULL OR length_m = 0;

-- 3. Populate cost_s where NULL or 0
--    Formula: travel_time_seconds = length_m / (speed_kmh * 1000 / 3600)
--    = length_m / speed_kmh * 3.6
--    Default speed fallback by road class if maxspeed is missing:
UPDATE ways SET
    cost_s = CASE
        WHEN maxspeed_forward IS NOT NULL AND maxspeed_forward > 0
            THEN length_m / (maxspeed_forward * 1000.0 / 3600.0)
        -- Road type defaults based on typical OSM tag_id values
        WHEN tag_id IN (100, 101)  THEN length_m / (100.0 * 1000.0 / 3600.0)  -- motorway: 100 km/h
        WHEN tag_id IN (110, 111)  THEN length_m / (80.0  * 1000.0 / 3600.0)  -- trunk: 80 km/h
        WHEN tag_id IN (120, 121)  THEN length_m / (60.0  * 1000.0 / 3600.0)  -- primary: 60 km/h
        WHEN tag_id IN (130, 131)  THEN length_m / (50.0  * 1000.0 / 3600.0)  -- secondary: 50 km/h
        WHEN tag_id IN (140, 141)  THEN length_m / (40.0  * 1000.0 / 3600.0)  -- tertiary: 40 km/h
        WHEN tag_id = 150          THEN length_m / (30.0  * 1000.0 / 3600.0)  -- residential: 30 km/h
        ELSE                            length_m / (25.0  * 1000.0 / 3600.0)  -- service/track: 25 km/h
    END
WHERE cost_s IS NULL OR cost_s <= 0;

UPDATE ways SET
    reverse_cost_s = CASE
        WHEN reverse_cost_s IS NOT NULL AND reverse_cost_s > 0 THEN reverse_cost_s
        WHEN maxspeed_backward IS NOT NULL AND maxspeed_backward > 0
            THEN length_m / (maxspeed_backward * 1000.0 / 3600.0)
        ELSE cost_s
    END
WHERE reverse_cost_s IS NULL OR reverse_cost_s <= 0;

-- 4. Verify
SELECT
    COUNT(*) AS total_edges,
    COUNT(cost_s) AS edges_with_time_cost,
    ROUND(AVG(cost_s)::numeric, 1) AS avg_travel_seconds,
    ROUND(MIN(cost_s)::numeric, 1) AS min_travel_seconds,
    ROUND(MAX(cost_s)::numeric, 1) AS max_travel_seconds
FROM ways
WHERE length_m > 0;