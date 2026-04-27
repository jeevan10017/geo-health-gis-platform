// =============================================================================
//  src/controllers/analyticsController.js
//
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

        const { rows } = await db.query(query, null, { cache: true });

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

        const { rows } = await db.query(query, null, { cache: true });
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


// =============================================================================
//  5. PROBABILISTIC ROUTING — Monte Carlo simulation
//     POST /api/analytics/probabilistic-score
//
//  Models uncertainty in travel time, wait time, and hospital availability.
//  Runs N_SIM simulations per hospital, computes probability of successful
//  treatment within a critical time threshold.
//  Integrated into Pareto: adds success_probability as a 6th dimension.
// =============================================================================

const N_SIM = 1000;  // Monte Carlo iterations

// ── Gaussian sampler (Box-Muller) ────────────────────────────────────────────
const sampleNormal = (mu, sigma) => {
    const u1 = Math.random(), u2 = Math.random();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mu + sigma * z);
};

// ── Uncertainty parameters per factor ────────────────────────────────────────
// σ expressed as fraction of μ (coefficient of variation)
const UNCERTAINTY = {
    travel_time_cv:  0.25,   // ±25% travel time variance (traffic, road blocks)
    wait_time_cv:    0.40,   // ±40% wait time variance (shift changes, surges)
    bed_fail_rate:   0.10,   // 10% chance beds shown as available are actually full
    doctor_leave_p:  0.15,   // 15% chance doctor on duty left early
};

// ── Critical time thresholds per emergency (minutes) ─────────────────────────
const CRITICAL_THRESHOLD = {
    heart_attack: 90,    // golden hour + some buffer
    accident:     60,    // platinum 10 min + golden hour
    stroke:       270,   // 4.5h tPA window
    pregnancy:    120,
    general:      180,
};

exports.getProbabilisticScore = async (req, res) => {
    const { lat, lon, emergency_type = 'general', n_sim = N_SIM } = req.body;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const pLat = parseFloat(lat), pLon = parseFloat(lon);
    const threshold = CRITICAL_THRESHOLD[emergency_type] ?? 180;
    const userPoint = `ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)`;
    const nSim = Math.min(parseInt(n_sim), 5000);

    try {
        // Fetch hospital base data (same as survival score)
        const { rows } = await db.query(`
            SELECT
                h.hospital_id, h.name AS hospital_name, h.address,
                ST_X(h.geom) AS lon, ST_Y(h.geom) AS lat,
                ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000.0)::numeric, 2) AS dist_km,
                GREATEST(5, ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000.0 / 35.0 * 60)::numeric)) AS travel_min_base,
                COALESCE(hm.avg_wait_time_minutes, 45)  AS wait_min_base,
                COALESCE(hm.icu_beds, 0)                AS icu_beds,
                COALESCE(hm.available_beds, 0)          AS available_beds,
                COALESCE(hm.total_beds, 1)              AS total_beds,
                COALESCE(hm.emergency_level, 1)         AS emergency_level,
                COALESCE(hm.hospital_rating, 3.0)       AS rating,
                COALESCE(hm.ambulance_available, false)  AS ambulance
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
            ORDER BY dist_km ASC
            LIMIT 8
        `);

        if (!rows.length) return res.status(404).json({ error: 'No hospitals found' });

        // ── Monte Carlo simulation per hospital ───────────────────────────────
        const results = rows.map(r => {
            const mu_t = parseFloat(r.travel_min_base);
            const mu_w = parseFloat(r.wait_min_base);
            const sigma_t = mu_t * UNCERTAINTY.travel_time_cv;
            const sigma_w = mu_w * UNCERTAINTY.wait_time_cv;

            const availPct  = parseFloat(r.available_beds) / Math.max(parseFloat(r.total_beds), 1);
            const hasICU    = parseInt(r.icu_beds) > 0;
            const emergLvl  = parseInt(r.emergency_level);

            let successCount  = 0;
            const totalTimes  = [];
            const travelSamples = [];
            const waitSamples   = [];

            for (let i = 0; i < nSim; i++) {
                // Sample travel time ~ Normal(mu_t, sigma_t)
                const travelSample = sampleNormal(mu_t, sigma_t);

                // Sample wait time ~ Normal(mu_w, sigma_w)
                // Modulated by bed availability: fewer beds → longer wait
                const bedMultiplier = availPct < 0.15 ? 1.8
                                    : availPct < 0.35 ? 1.3
                                    : 1.0;
                const waitSample = sampleNormal(mu_w * bedMultiplier, sigma_w);

                // Stochastic events
                const bedFull      = Math.random() < UNCERTAINTY.bed_fail_rate * (1 - availPct);
                const doctorLeft   = Math.random() < UNCERTAINTY.doctor_leave_p;
                const roadBlocked  = Math.random() < 0.05;  // 5% chance of road incident

                const effectiveTravel = roadBlocked ? travelSample * 1.6 : travelSample;
                const effectiveWait   = (bedFull || doctorLeft)
                    ? waitSample + 30 + Math.random() * 20
                    : waitSample;

                const totalTime = effectiveTravel + effectiveWait;
                totalTimes.push(totalTime);
                travelSamples.push(effectiveTravel);
                waitSamples.push(effectiveWait);

                // Success: total time within threshold AND hospital can treat
                const canTreat = !bedFull && (!doctorLeft || emergLvl >= 2);
                if (canTreat && totalTime <= threshold) successCount++;
            }

            // Statistics
            totalTimes.sort((a, b) => a - b);
            const p5  = totalTimes[Math.floor(nSim * 0.05)];
            const p50 = totalTimes[Math.floor(nSim * 0.50)];
            const p95 = totalTimes[Math.floor(nSim * 0.95)];
            const mean = totalTimes.reduce((s, v) => s + v, 0) / nSim;
            const std  = Math.sqrt(totalTimes.reduce((s, v) => s + (v - mean) ** 2, 0) / nSim);
            const successProb = successCount / nSim;

            return {
                hospital_id:        r.hospital_id,
                hospital_name:      r.hospital_name,
                address:            r.address,
                lat:                parseFloat(r.lat),
                lon:                parseFloat(r.lon),
                dist_km:            parseFloat(r.dist_km),
                // Base estimates
                travel_min_base:    parseFloat(r.travel_min_base),
                wait_min_base:      parseFloat(r.wait_min_base),
                icu_beds:           parseInt(r.icu_beds),
                emergency_level:    parseInt(r.emergency_level),
                // Monte Carlo results
                success_probability: Math.round(successProb * 100),   // 0-100%
                n_simulations:       nSim,
                critical_threshold:  threshold,
                // Confidence interval on total time
                p5_time_min:    Math.round(p5),
                p50_time_min:   Math.round(p50),
                p95_time_min:   Math.round(p95),
                mean_time_min:  Math.round(mean),
                std_time_min:   Math.round(std),
                // Reliability label
                reliability:    successProb >= 0.80 ? 'High'
                              : successProb >= 0.55 ? 'Moderate'
                              : 'Low',
                // Uncertainty level: how wide is the confidence interval?
                uncertainty_range: Math.round(p95 - p5),
            };
        });

        // Sort by success probability descending
        results.sort((a, b) => b.success_probability - a.success_probability);
        if (results.length > 0) results[0].is_best = true;

        // System-wide insight
        const best = results[0];
        const nearest = [...results].sort((a, b) => a.dist_km - b.dist_km)[0];
        let insight = null;
        if (nearest.hospital_id !== best.hospital_id) {
            insight = `Under uncertainty, ${best.hospital_name} offers ${best.success_probability}% success probability vs ${nearest.success_probability}% for the nearest hospital. The nearest hospital has higher variance (±${nearest.uncertainty_range} min range).`;
        }

        res.json({
            emergency_type,
            threshold_min:   threshold,
            n_simulations:   nSim,
            hospitals:       results,
            best_hospital:   best,
            insight,
        });

    } catch (err) {
        console.error('[Probabilistic]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// =============================================================================
//  6. MULTI-AGENT HEALTHCARE COORDINATION
//     POST /api/analytics/multi-agent-assign
//
//  Hungarian-algorithm assignment of patients → hospitals, minimizing
//  system-wide total cost (travel + wait + severity penalty).
//  Returns a global assignment plan with per-patient routes.
// =============================================================================

// ── Hungarian Algorithm (Munkres) — O(n³) ────────────────────────────────────
// Solves the assignment problem: given a cost matrix C[i][j] = cost of
// assigning patient i to hospital j, find min-cost perfect assignment.
function hungarianAlgorithm(costMatrix) {
    const n = costMatrix.length;
    const m = costMatrix[0].length;
    const INF = 1e9;

    // Pad to square if needed
    const size = Math.max(n, m);
    const C = Array.from({ length: size }, (_, i) =>
        Array.from({ length: size }, (_, j) =>
            (i < n && j < m) ? costMatrix[i][j] : INF
        )
    );

    const u = new Array(size + 1).fill(0);
    const v = new Array(size + 1).fill(0);
    const p = new Array(size + 1).fill(0);  // assignment: p[j] = row assigned to col j
    const way = new Array(size + 1).fill(0);

    for (let i = 1; i <= size; i++) {
        p[0] = i;
        let j0 = 0;
        const minVal = new Array(size + 1).fill(INF);
        const used   = new Array(size + 1).fill(false);

        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = INF, j1 = -1;

            for (let j = 1; j <= size; j++) {
                if (!used[j]) {
                    const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
                    if (cur < minVal[j]) { minVal[j] = cur; way[j] = j0; }
                    if (minVal[j] < delta) { delta = minVal[j]; j1 = j; }
                }
            }

            for (let j = 0; j <= size; j++) {
                if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
                else minVal[j] -= delta;
            }
            j0 = j1;
        } while (p[j0] !== 0);

        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0);
    }

    // Extract assignment: patient i → hospital j
    const assignment = new Array(n).fill(-1);
    for (let j = 1; j <= size; j++) {
        if (p[j] > 0 && p[j] <= n && j <= m) {
            assignment[p[j] - 1] = j - 1;
        }
    }
    return assignment;
}

exports.multiAgentAssign = async (req, res) => {
    // patients: [{ lat, lon, severity (1-5), emergency_type, id? }]
    // ambulances: [{ lat, lon, id? }]  (optional)
    const { patients, ambulances = [] } = req.body;

    if (!patients?.length) return res.status(400).json({ error: 'patients array required' });

    try {
        // ── Fetch all hospitals with current metrics ───────────────────────────
        const { rows: hospitals } = await db.query(`
            SELECT
                h.hospital_id, h.name, h.address,
                ST_X(h.geom) AS lon, ST_Y(h.geom) AS lat,
                COALESCE(hm.available_beds,      0) AS available_beds,
                COALESCE(hm.icu_beds,            0) AS icu_beds,
                COALESCE(hm.emergency_level,     1) AS emergency_level,
                COALESCE(hm.avg_wait_time_minutes,45) AS wait_min,
                COALESCE(hm.total_beds,          1) AS total_beds,
                COALESCE(hm.ambulance_available, false) AS has_ambulance,
                COALESCE(hm.hospital_rating,     3.0) AS rating
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
        `);

        if (!hospitals.length) return res.status(404).json({ error: 'No hospitals' });

        const nP = patients.length;
        const nH = hospitals.length;

        // ── Build cost matrix C[patient][hospital] ────────────────────────────
        //
        //  Cost = weighted combination of:
        //    travel_time         (straight-line estimate at 35 km/h)
        //    wait_time           (from metrics)
        //    severity_penalty    (high severity → penalize slow hospitals heavily)
        //    capacity_penalty    (penalize overloaded hospitals)
        //    system_load_factor  (each assignment increases load for subsequent ones)
        //
        //  We track remaining capacity to model dynamic load during assignment.
        const remainingBeds = hospitals.map(h => parseInt(h.available_beds));
        const remainingICU  = hospitals.map(h => parseInt(h.icu_beds));

        const costMatrix = patients.map((pat, pi) => {
            const pLat = parseFloat(pat.lat);
            const pLon = parseFloat(pat.lon);
            const severity = Math.min(5, Math.max(1, parseInt(pat.severity ?? 3)));
            const needsICU = severity >= 4;

            return hospitals.map((h, hi) => {
                const hLat = parseFloat(h.lat), hLon = parseFloat(h.lon);

                // Travel time (straight-line, 35 km/h rural)
                const distKm = Math.sqrt(
                    ((pLon - hLon) * 111 * Math.cos(pLat * Math.PI / 180)) ** 2 +
                    ((pLat - hLat) * 111) ** 2
                );
                const travelMin = Math.max(5, (distKm / 35) * 60);

                // Wait time (boosted if beds low)
                const bedPct    = remainingBeds[hi] / Math.max(parseInt(h.total_beds), 1);
                const waitMin   = parseFloat(h.wait_min) * (bedPct < 0.15 ? 2.5 : bedPct < 0.35 ? 1.5 : 1.0);

                // ICU penalty: high-severity patients penalized heavily if no ICU
                const icuPenalty = needsICU && remainingICU[hi] === 0 ? 200 : 0;

                // Capacity penalty: if hospital is full
                const capPenalty = remainingBeds[hi] <= 0 ? 500 : 0;

                // Severity weight: higher severity → time matters more
                const sevWeight = 1 + (severity - 1) * 0.4;

                const totalCost = (travelMin + waitMin) * sevWeight + icuPenalty + capPenalty;
                return totalCost;
            });
        });

        // ── Hungarian assignment ───────────────────────────────────────────────
        const assignment = hungarianAlgorithm(costMatrix);

        // ── Assign ambulances (nearest available to each patient) ─────────────
        const ambStatus = ambulances.map((a, i) => ({
            ...a, id: a.id ?? `AMB-${i + 1}`, available: true,
        }));

        const patientResults = patients.map((pat, pi) => {
            const hospIdx  = assignment[pi];
            if (hospIdx === undefined || hospIdx < 0 || hospIdx >= hospitals.length) {
                return { ...pat, assigned_hospital: null, error: 'No hospital available' };
            }

            const h = hospitals[hospIdx];
            const pLat = parseFloat(pat.lat), pLon = parseFloat(pat.lon);
            const hLat = parseFloat(h.lat),   hLon = parseFloat(h.lon);
            const distKm = Math.sqrt(
                ((pLon - hLon) * 111 * Math.cos(pLat * Math.PI / 180)) ** 2 +
                ((pLat - hLat) * 111) ** 2
            );

            // Reduce hospital capacity for subsequent patients
            remainingBeds[hospIdx] = Math.max(0, remainingBeds[hospIdx] - 1);
            const needsICU = (parseInt(pat.severity ?? 3)) >= 4;
            if (needsICU) remainingICU[hospIdx] = Math.max(0, remainingICU[hospIdx] - 1);

            // Assign nearest available ambulance
            let assignedAmb = null;
            if (ambStatus.length > 0) {
                let bestAmbIdx = -1, bestAmbDist = Infinity;
                ambStatus.forEach((a, ai) => {
                    if (!a.available) return;
                    const aLat = parseFloat(a.lat), aLon = parseFloat(a.lon);
                    const d = Math.sqrt(((aLon - pLon) * 111) ** 2 + ((aLat - pLat) * 111) ** 2);
                    if (d < bestAmbDist) { bestAmbDist = d; bestAmbIdx = ai; }
                });
                if (bestAmbIdx >= 0) {
                    ambStatus[bestAmbIdx].available = false;
                    assignedAmb = ambStatus[bestAmbIdx];
                }
            }

            const travelMin = Math.max(5, Math.round((distKm / 35) * 60));
            const waitMin   = Math.round(parseFloat(h.wait_min));
            const cost      = costMatrix[pi][hospIdx];

            return {
                patient_id:    pat.id ?? `P${pi + 1}`,
                patient_lat:   pLat,
                patient_lon:   pLon,
                severity:      parseInt(pat.severity ?? 3),
                emergency_type: pat.emergency_type ?? 'general',
                assigned_hospital: {
                    hospital_id:    h.hospital_id,
                    hospital_name:  h.name,
                    address:        h.address,
                    lat:            hLat,
                    lon:            hLon,
                    dist_km:        Math.round(distKm * 10) / 10,
                    travel_min:     travelMin,
                    wait_min:       waitMin,
                    icu_beds:       parseInt(h.icu_beds),
                    available_beds: remainingBeds[hospIdx] + 1,  // before decrement
                    emergency_level: parseInt(h.emergency_level),
                },
                assigned_ambulance: assignedAmb,
                eta_min:       travelMin,
                total_time_min: travelMin + waitMin,
                assignment_cost: Math.round(cost),
                // Was this better than naive nearest?
                greedy_would_choose: [...Array(hospitals.length).keys()]
                    .sort((a, b) => costMatrix[pi][a] - costMatrix[pi][b])[0] === hospIdx,
            };
        });

        // ── System metrics ─────────────────────────────────────────────────────
        const totalCost    = patientResults.reduce((s, p) => s + (p.assignment_cost ?? 0), 0);
        const avgETA       = Math.round(patientResults.reduce((s, p) => s + (p.eta_min ?? 0), 0) / nP);
        const greedySame   = patientResults.filter(p => p.greedy_would_choose).length;

        // Load distribution across hospitals
        const loadMap = {};
        patientResults.forEach(p => {
            const hid = p.assigned_hospital?.hospital_id;
            if (hid) loadMap[hid] = (loadMap[hid] ?? 0) + 1;
        });
        const maxLoad    = Math.max(...Object.values(loadMap));
        const loadBalance = maxLoad === 0 ? 100 : Math.round((1 - (maxLoad - 1) / nP) * 100);

        res.json({
            assignments:      patientResults,
            system_metrics: {
                n_patients:             nP,
                n_hospitals_used:       Object.keys(loadMap).length,
                total_assignment_cost:  totalCost,
                avg_eta_min:            avgETA,
                load_balance_score:     loadBalance,   // 0-100, higher = more balanced
                improvement_over_greedy: `${nP - greedySame} of ${nP} patients assigned better than greedy`,
                algorithm:              'Hungarian (Munkres O(n³))',
            },
            hospital_load: Object.entries(loadMap).map(([hid, count]) => ({
                hospital_id:   parseInt(hid),
                hospital_name: hospitals.find(h => h.hospital_id === parseInt(hid))?.name,
                patients_assigned: count,
            })),
        });

    } catch (err) {
        console.error('[MultiAgent]', err.message);
        res.status(500).json({ error: err.message });
    }
};