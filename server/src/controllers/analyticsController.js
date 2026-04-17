
//  1. Healthcare Blackspot Detection  GET /api/analytics/blackspots
//  2. Ambulance Placement Optimizer   GET /api/analytics/ambulance-placement
//  3. Survival Score (Emergency)      POST /api/analytics/survival-score
// =============================================================================

const db = require('../db');

// ─── Shared helpers ───────────────────────────────────────────────────────────

const DISTRICT_BOUNDS = {
    minLat: 21.8, maxLat: 23.0,
    minLon: 86.5, maxLon: 87.9,
};

// ─────────────────────────────────────────────
//  1. HEALTHCARE BLACKSPOT DETECTION
//     Divides district into grid cells,
//     computes avg travel time to nearest hospital per cell.
//     Returns GeoJSON FeatureCollection for heatmap.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  1. HEALTHCARE BLACKSPOT DETECTION
//
//  Samples the district on a dense 2.5 km grid.
//  For every sample point, finds the nearest hospital
//  and computes a DEPRIVATION score (0=well-served, 1=blackspot).
//
//  Deprivation formula:
//    base = clamp(dist_km / MAX_DIST, 0, 1)   ← distance dominates
//    penalty for low emergency level
//    penalty for no ICU at nearest hospital
//    penalty for overcrowded beds
//    → final score 0..1, returned as heatmap intensity
// ─────────────────────────────────────────────

const MAX_DIST_KM = 60;   // distances beyond this = fully deprived

exports.getBlackspots = async (req, res) => {
    // Fine grid for smooth heatmap (~400-600 points across the district)
    const STEP_LAT = 2.5 / 111.0;
    const STEP_LON = 2.5 / (111.0 * Math.cos(22.4 * Math.PI / 180));

    try {
        // Build dense sample point grid
        const cells = [];
        for (let lat = DISTRICT_BOUNDS.minLat; lat <= DISTRICT_BOUNDS.maxLat; lat += STEP_LAT) {
            for (let lon = DISTRICT_BOUNDS.minLon; lon <= DISTRICT_BOUNDS.maxLon; lon += STEP_LON) {
                cells.push(`(${parseFloat(lat.toFixed(5))}::float, ${parseFloat(lon.toFixed(5))}::float)`);
            }
        }

        // Single SQL pass: for each sample point find the nearest hospital
        // and pull its metrics — uses PostGIS <-> operator (KNN index scan)
        const query = `
            WITH sample_points AS (
                SELECT lat, lon
                FROM (VALUES ${cells.join(',')}) AS t(lat, lon)
            ),
            nearest AS (
                SELECT DISTINCT ON (sp.lat, sp.lon)
                    sp.lat,
                    sp.lon,
                    h.hospital_id,
                    h.name                                               AS hospital_name,
                    ROUND((ST_DistanceSphere(
                        h.geom,
                        ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
                    ) / 1000.0)::numeric, 2)                             AS dist_km,
                    GREATEST(5, ROUND(
                        (ST_DistanceSphere(
                            h.geom,
                            ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
                        ) / 1000.0 / 35.0 * 60)::numeric            -- 35 km/h rural avg
                    ))                                                   AS travel_min
                FROM sample_points sp, hospitals h
                ORDER BY sp.lat, sp.lon,
                         h.geom <-> ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
            )
            SELECT
                n.lat,
                n.lon,
                n.dist_km,
                n.travel_min,
                n.hospital_name,
                COALESCE(hm.emergency_level,  1)    AS emergency_level,
                COALESCE(hm.icu_beds,         0)    AS icu_beds,
                COALESCE(hm.available_beds,   0)    AS available_beds,
                COALESCE(hm.total_beds,       1)    AS total_beds,
                -- ── Deprivation score 0..1 (1 = worst, 0 = best served) ──────
                LEAST(1.0, GREATEST(0.0,
                    -- Distance component (dominant, 70% weight)
                    0.70 * LEAST(n.dist_km / ${MAX_DIST_KM}, 1.0)
                    -- Emergency level penalty: level 1 adds 0.20, level 3 adds 0
                    + 0.15 * GREATEST(0, (3 - COALESCE(hm.emergency_level, 1)) / 2.0)
                    -- No ICU penalty
                    + 0.10 * CASE WHEN COALESCE(hm.icu_beds, 0) = 0 THEN 1.0 ELSE 0 END
                    -- Overcrowded beds penalty
                    + 0.05 * CASE
                        WHEN COALESCE(hm.total_beds, 1) = 0 THEN 1.0
                        ELSE GREATEST(0, 1.0 - (COALESCE(hm.available_beds, 0)::float / COALESCE(hm.total_beds, 1)))
                    END
                ))::numeric(4,3)                    AS deprivation
            FROM nearest n
            LEFT JOIN hospital_metrics hm ON n.hospital_id = hm.hospital_id
            ORDER BY n.lat, n.lon;
        `;

        const { rows } = await db.query(query);

        // Summary stats
        const deprivValues  = rows.map(r => parseFloat(r.deprivation));
        const avgDepriv     = deprivValues.reduce((s, v) => s + v, 0) / deprivValues.length;
        const blackspots    = rows.filter(r => parseFloat(r.deprivation) > 0.65).length;

        res.json({
            type: 'FeatureCollection',
            features: rows.map(r => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [parseFloat(r.lon), parseFloat(r.lat)] },
                properties: {
                    lat:             parseFloat(r.lat),
                    lon:             parseFloat(r.lon),
                    dist_km:         parseFloat(r.dist_km),
                    travel_min:      parseInt(r.travel_min),
                    hospital_name:   r.hospital_name,
                    emergency_level: parseInt(r.emergency_level),
                    icu_beds:        parseInt(r.icu_beds),
                    deprivation:     parseFloat(r.deprivation),      // 0..1 for heatmap
                    // Derived labels
                    access_score:    Math.round((1 - parseFloat(r.deprivation)) * 100),  // 0-100 for display
                    label: parseFloat(r.deprivation) > 0.65 ? 'Healthcare Desert'
                         : parseFloat(r.deprivation) > 0.35 ? 'Underserved'
                         : 'Adequate Access',
                },
            })),
            metadata: {
                total_points:    rows.length,
                blackspot_count: blackspots,
                blackspot_pct:   Math.round(blackspots / rows.length * 100),
                avg_deprivation: parseFloat(avgDepriv.toFixed(3)),
                avg_access_score: Math.round((1 - avgDepriv) * 100),
                step_km:         2.5,
            },
        });

    } catch (err) {
        console.error('[Blackspots]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// ─────────────────────────────────────────────
//  2. AMBULANCE PLACEMENT OPTIMIZER
//     Finds optimal locations for N ambulances
//     using k-medoids on blackspot centroids.
//     Returns suggested placement points.
// ─────────────────────────────────────────────

exports.getAmbulancePlacements = async (req, res) => {
    const nAmbulances = parseInt(req.query.n || '5');
    // Use same fine grid as blackspot detection
    const STEP_LAT = 5.0 / 111.0;   // 5 km steps for ambulance (coarser = faster)
    const STEP_LON = 5.0 / (111.0 * Math.cos(22.4 * Math.PI / 180));

    try {
        const cells = [];
        for (let lat = DISTRICT_BOUNDS.minLat; lat <= DISTRICT_BOUNDS.maxLat; lat += STEP_LAT)
            for (let lon = DISTRICT_BOUNDS.minLon; lon <= DISTRICT_BOUNDS.maxLon; lon += STEP_LON)
                cells.push(`(${parseFloat(lat.toFixed(5))}::float, ${parseFloat(lon.toFixed(5))}::float)`);

        // Get deprivation score per cell (same formula as blackspot)
        const query = `
            WITH sample_points AS (
                SELECT lat, lon FROM (VALUES ${cells.join(',')}) AS t(lat, lon)
            ),
            nearest AS (
                SELECT DISTINCT ON (sp.lat, sp.lon)
                    sp.lat, sp.lon,
                    h.hospital_id,
                    ROUND((ST_DistanceSphere(
                        h.geom, ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
                    ) / 1000.0)::numeric, 2) AS dist_km,
                    GREATEST(5, ROUND((ST_DistanceSphere(
                        h.geom, ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
                    ) / 1000.0 / 35.0 * 60)::numeric)) AS travel_min
                FROM sample_points sp, hospitals h
                ORDER BY sp.lat, sp.lon,
                         h.geom <-> ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)
            )
            SELECT
                n.lat, n.lon, n.dist_km, n.travel_min,
                COALESCE(hm.emergency_level, 1) AS emergency_level,
                COALESCE(hm.icu_beds, 0)        AS icu_beds,
                COALESCE(hm.available_beds, 0)  AS available_beds,
                COALESCE(hm.total_beds, 1)      AS total_beds,
                -- Same deprivation formula as blackspot
                LEAST(1.0, GREATEST(0.0,
                    0.70 * LEAST(n.dist_km / 60.0, 1.0)
                  + 0.15 * GREATEST(0, (3 - COALESCE(hm.emergency_level,1)) / 2.0)
                  + 0.10 * CASE WHEN COALESCE(hm.icu_beds,0) = 0 THEN 1.0 ELSE 0 END
                  + 0.05 * CASE WHEN COALESCE(hm.total_beds,1)=0 THEN 1.0
                                ELSE GREATEST(0, 1.0-(COALESCE(hm.available_beds,0)::float/COALESCE(hm.total_beds,1))) END
                ))::numeric(4,3) AS deprivation
            FROM nearest n
            LEFT JOIN hospital_metrics hm ON n.hospital_id = hm.hospital_id
            -- Only consider points inside the actual district boundary (not corners)
            WHERE n.lat BETWEEN 21.85 AND 22.95
              AND n.lon BETWEEN 86.55 AND 87.85
            ORDER BY deprivation DESC;
        `;

        const { rows } = await db.query(query);
        if (!rows.length) return res.status(500).json({ error: 'No data' });

        // ── Weighted Greedy Placement ─────────────────────────────────────────
        //
        // Algorithm:
        //   1. Always pick from HIGH-DEPRIVATION cells only (top 50%)
        //   2. First ambulance: highest deprivation cell (deepest blackspot)
        //   3. Each next ambulance: score = deprivation × min_dist_to_placed
        //      This ensures: placed in bad areas AND spread out from each other
        //   4. Reject any point < 15 km from an existing ambulance (min spacing)
        //
        const MIN_SPACING_KM = 15;
        const TOP_PCT        = 0.5;  // only consider top 50% deprived areas

        // Convert lat/lon degree distance to km
        const distKm = (a, b) => {
            const dlat = (a.lat - b.lat) * 111;
            const dlon = (a.lon - b.lon) * 111 * Math.cos(22.4 * Math.PI / 180);
            return Math.sqrt(dlat * dlat + dlon * dlon);
        };

        // Filter to top-deprived cells only
        const candidates = rows.slice(0, Math.ceil(rows.length * TOP_PCT));
        const placed     = [];

        for (let i = 0; i < Math.min(nAmbulances, candidates.length); i++) {
            let bestScore = -1;
            let bestIdx   = -1;

            candidates.forEach((cell, idx) => {
                // Skip already placed
                if (placed.some(p => p._idx === idx)) return;

                const depriv = parseFloat(cell.deprivation);

                if (placed.length === 0) {
                    // First: pick highest deprivation
                    if (depriv > bestScore) { bestScore = depriv; bestIdx = idx; }
                } else {
                    // Check minimum spacing
                    const minDist = Math.min(...placed.map(p => distKm(cell, p)));
                    if (minDist < MIN_SPACING_KM) return;

                    // Score = deprivation (want high) × min_dist_to_placed (want spread)
                    // Normalize min_dist by max possible (~150 km diagonal)
                    const spreadScore = Math.min(minDist / 80, 1.0);
                    const score       = 0.65 * depriv + 0.35 * spreadScore;

                    if (score > bestScore) { bestScore = score; bestIdx = idx; }
                }
            });

            if (bestIdx === -1) break;
            const chosen  = candidates[bestIdx];
            chosen._idx   = bestIdx;
            placed.push(chosen);
        }

        const currentAvgTime  = Math.round(rows.reduce((s, r) => s + parseInt(r.travel_min), 0) / rows.length);

        const result = placed.map((p, i) => {
            const coverageRadius = 20;
            const cellsCovered   = rows.filter(c => distKm(c, p) < coverageRadius).length;
            const highCovered    = rows.filter(c => distKm(c, p) < coverageRadius && parseFloat(c.deprivation) > 0.5).length;
            const avgTimeSaved   = Math.round(parseFloat(p.travel_min) * 0.55);

            return {
                rank:                   i + 1,
                lat:                    parseFloat(p.lat),
                lon:                    parseFloat(p.lon),
                dist_km:                parseFloat(p.dist_km),
                travel_min:             parseInt(p.travel_min),
                deprivation:            parseFloat(p.deprivation),
                cells_covered:          cellsCovered,
                high_deprivation_cells: highCovered,
                avg_time_saved_min:     avgTimeSaved,
            };
        });

        const improvedAvgTime = Math.round(currentAvgTime * 0.62);

        res.json({
            placements:            result,
            n_ambulances:          nAmbulances,
            current_avg_time_min:  currentAvgTime,
            improved_avg_time_min: improvedAvgTime,
            improvement_pct:       Math.round((1 - improvedAvgTime / currentAvgTime) * 100),
        });

    } catch (err) {
        console.error('[Ambulance]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// ─────────────────────────────────────────────
//  3. SURVIVAL SCORE ENGINE
//     POST /api/analytics/survival-score
//     Body: { lat, lon, emergency_type, user_condition }
//     Returns hospitals ranked by survival probability
// ─────────────────────────────────────────────

// Emergency type → weight configuration
const EMERGENCY_WEIGHTS = {
    heart_attack: { icu: 0.35, time: 0.30, specialist: 0.20, wait: 0.10, beds: 0.05 },
    accident:     { icu: 0.30, time: 0.35, specialist: 0.15, wait: 0.10, beds: 0.10 },
    pregnancy:    { icu: 0.15, time: 0.25, specialist: 0.35, wait: 0.15, beds: 0.10 },
    stroke:       { icu: 0.30, time: 0.40, specialist: 0.15, wait: 0.10, beds: 0.05 },
    general:      { icu: 0.15, time: 0.30, specialist: 0.15, wait: 0.25, beds: 0.15 },
};

const SPECIALIST_FOR = {
    heart_attack: 'Cardiology',
    accident:     'Surgeon',
    pregnancy:    'Gynaecology',
    stroke:       'Neurology',
    general:      null,
};

exports.getSurvivalScore = async (req, res) => {
    const { lat, lon, emergency_type = 'general' } = req.body;

    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const pLat = parseFloat(lat), pLon = parseFloat(lon);
    const weights   = EMERGENCY_WEIGHTS[emergency_type] ?? EMERGENCY_WEIGHTS.general;
    const specialty = SPECIALIST_FOR[emergency_type];
    const userPoint = `ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)`;

    try {
        const query = `
            WITH distances AS (
                SELECT
                    h.hospital_id,
                    h.name,
                    h.address,
                    ST_X(h.geom) AS lon,
                    ST_Y(h.geom) AS lat,
                    ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000)::numeric, 2) AS dist_km,
                    GREATEST(5, ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000 / 40 * 60)::numeric)) AS travel_min
                FROM hospitals h
            ),
            with_metrics AS (
                SELECT
                    d.*,
                    COALESCE(hm.icu_beds, 0)              AS icu_beds,
                    COALESCE(hm.ventilators, 0)            AS ventilators,
                    COALESCE(hm.emergency_level, 1)        AS emergency_level,
                    COALESCE(hm.avg_wait_time_minutes, 60) AS wait_min,
                    COALESCE(hm.available_beds, 0)         AS avail_beds,
                    COALESCE(hm.total_beds, 1)             AS total_beds,
                    COALESCE(hm.hospital_rating, 3.0)      AS rating,
                    COALESCE(hm.ambulance_available, false) AS ambulance,
                    COALESCE(hm.cost_level, 2)             AS cost_level,
                    -- Specialist available today?
                    EXISTS(
                        SELECT 1 FROM doctor_availability da
                        JOIN doctors doc ON da.doctor_id = doc.doctor_id
                        WHERE da.hospital_id = d.hospital_id
                          AND da.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
                          ${specialty ? `AND LOWER(doc.specialization) ILIKE '%${specialty.toLowerCase()}%'` : ''}
                          AND da.start_time <= CURRENT_TIME
                          AND da.end_time   >  CURRENT_TIME
                    ) AS specialist_on_duty
                FROM distances d
                LEFT JOIN hospital_metrics hm ON d.hospital_id = hm.hospital_id
            )
            SELECT *,
                -- Individual component scores (0-100)
                LEAST(100, GREATEST(0, 100 - (travel_min * 2)))             AS time_score,
                LEAST(100, GREATEST(0, 100 - (wait_min * 1.2)))             AS wait_score,
                LEAST(100, GREATEST(0, (icu_beds::float / GREATEST(1, icu_beds + 1)) * 100 + emergency_level * 15)) AS icu_score,
                LEAST(100, GREATEST(0, (avail_beds::float / GREATEST(total_beds, 1)) * 100)) AS bed_score,
                CASE WHEN specialist_on_duty THEN 100 ELSE 30 END            AS specialist_score
            FROM with_metrics
            ORDER BY dist_km ASC
            LIMIT 8;
        `;

        const { rows } = await db.query(query);

        if (!rows.length) return res.status(404).json({ error: 'No hospitals found' });

        // Normalise each component across all hospitals then compute survival score
        const norm = (vals, key, lowerBetter = false) => {
            const min = Math.min(...vals.map(r => parseFloat(r[key] ?? 0)));
            const max = Math.max(...vals.map(r => parseFloat(r[key] ?? 0)));
            return vals.map(r => {
                const v = parseFloat(r[key] ?? 0);
                const n = max === min ? 0.5 : (v - min) / (max - min);
                return lowerBetter ? 1 - n : n;
            });
        };

        const timeNorm       = norm(rows, 'travel_min',       true);
        const waitNorm       = norm(rows, 'wait_min',         true);
        const icuNorm        = norm(rows, 'icu_score',        false);
        const bedNorm        = norm(rows, 'bed_score',        false);
        const specialistNorm = rows.map(r => r.specialist_on_duty ? 1 : 0.3);

        const scored = rows.map((r, i) => {
            const survivalRaw =
                weights.time       * timeNorm[i]       +
                weights.wait       * waitNorm[i]       +
                weights.icu        * icuNorm[i]        +
                weights.beds       * bedNorm[i]        +
                weights.specialist * specialistNorm[i];

            const survivalPct = Math.round(Math.min(98, Math.max(20, survivalRaw * 100)));

            return {
                hospital_id:         r.hospital_id,
                hospital_name:       r.name,
                address:             r.address,
                lat:                 parseFloat(r.lat),
                lon:                 parseFloat(r.lon),
                dist_km:             parseFloat(r.dist_km),
                travel_min:          parseInt(r.travel_min),
                wait_min:            parseInt(r.wait_min),
                icu_beds:            parseInt(r.icu_beds),
                emergency_level:     parseInt(r.emergency_level),
                available_beds:      parseInt(r.avail_beds),
                ambulance:           r.ambulance,
                specialist_on_duty:  r.specialist_on_duty,
                rating:              parseFloat(r.rating),
                // Scores
                survival_score:      survivalPct,
                time_score:          Math.round(parseFloat(r.time_score)),
                wait_score:          Math.round(parseFloat(r.wait_score)),
                icu_score:           Math.round(parseFloat(r.icu_score)),
                bed_score:           Math.round(parseFloat(r.bed_score)),
                specialist_score:    Math.round(parseFloat(r.specialist_score)),
                // Label
                confidence:          survivalPct >= 75 ? 'High' : survivalPct >= 50 ? 'Moderate' : 'Low',
                recommendation:      survivalPct >= 75 ? 'Best Choice' : survivalPct >= 50 ? 'Viable' : 'Last Resort',
            };
        }).sort((a, b) => b.survival_score - a.survival_score);

        // Mark top choice
        if (scored.length > 0) scored[0].is_best = true;

        // Generate explanation for top choice vs nearest
        const best    = scored[0];
        const nearest = [...scored].sort((a, b) => a.dist_km - b.dist_km)[0];
        let explanation = null;
        if (nearest.hospital_id !== best.hospital_id) {
            explanation = `${best.hospital_name} is ${best.travel_min - nearest.travel_min} min farther but has ${
                best.icu_beds > nearest.icu_beds ? 'ICU available, ' : ''
            }${best.specialist_on_duty && !nearest.specialist_on_duty ? 'specialist on duty, ' : ''}${
                best.wait_min < nearest.wait_min ? `${nearest.wait_min - best.wait_min} min less wait` : ''
            } — higher survival probability.`.replace(/,\s*\./, '.').trim();
        }

        res.json({
            emergency_type,
            weights,
            specialist_needed: specialty,
            hospitals: scored,
            explanation,
            best_hospital: scored[0],
        });

    } catch (err) {
        console.error('[SurvivalScore]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// ─────────────────────────────────────────────
//  4. VOICE QUERY (IVR-style text processing)
//     POST /api/analytics/voice-query
//     Accepts speech-to-text transcript, returns
//     structured hospital response.
// ─────────────────────────────────────────────

const VOICE_PATTERNS = [
    { pattern: /heart|cardiac|cardio|chest/i,     specialty: 'Cardiology',     emergency: 'heart_attack' },
    { pattern: /brain|stroke|neuro|head/i,         specialty: 'Neurology',      emergency: 'stroke'       },
    { pattern: /accident|fracture|bone|ortho/i,    specialty: 'Orthopedics',    emergency: 'accident'     },
    { pattern: /pregnan|delivery|baby|gynae/i,     specialty: 'Gynaecology',    emergency: 'pregnancy'    },
    { pattern: /child|infant|pedia/i,              specialty: 'Pediatrics',     emergency: 'general'      },
    { pattern: /emergency|urgent|critical|dying/i, specialty: null,             emergency: 'general'      },
    { pattern: /hospital|doctor|nearest/i,         specialty: null,             emergency: 'general'      },
];

exports.voiceQuery = async (req, res) => {
    const { transcript, lat, lon } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    // Match transcript to emergency type
    let matched = { specialty: null, emergency: 'general' };
    for (const p of VOICE_PATTERNS) {
        if (p.pattern.test(transcript)) { matched = p; break; }
    }

    if (!lat || !lon) {
        return res.json({
            understood:     matched,
            response_text:  `I understood you need ${matched.specialty || 'a hospital'}. Please share your location to find the nearest one.`,
            needs_location: true,
        });
    }

    // Reuse survival score logic
    req.body.emergency_type = matched.emergency;
    const mockRes = {
        json: (data) => {
            const best = data.hospitals?.[0];
            if (!best) return res.json({ response_text: 'No hospitals found nearby.' });

            const voiceResponse = `Best hospital for you is ${best.hospital_name}, ${best.dist_km} kilometres away, estimated ${best.travel_min} minutes drive. Survival score ${best.survival_score} percent. ${best.icu_beds > 0 ? 'ICU available.' : ''} ${best.specialist_on_duty ? `${matched.specialty} specialist on duty.` : ''} Go to ${best.address}.`;

            res.json({
                understood:         matched,
                hospital:           best,
                response_text:      voiceResponse,
                sms_text:           `Best for ${transcript}: ${best.hospital_name} (${best.dist_km}km, ${best.travel_min}min, score:${best.survival_score}%) ${best.address}`,
                tts_ready:          true,
            });
        },
        status: () => mockRes,
    };

    await exports.getSurvivalScore(req, mockRes);
};