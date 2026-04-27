// =============================================================================
//  src/controllers/probabilisticController.js
//
//  1. Monte Carlo Probabilistic Routing  POST /api/probabilistic/route
//     Models uncertainty in travel time, wait time, bed availability.
//     Returns success probability per hospital + confidence intervals.
//
//  2. Multi-Agent Coordinator            POST /api/agents/coordinate
//     Solves the joint ambulance-patient-hospital assignment problem.
//     Algorithm: weighted Hungarian + greedy fallback.
//     Objective: minimize Σ(travel_time + wait_time + overload_penalty)
// =============================================================================

const db = require('../db');


const N_SIMULATIONS     = 1000;   // Monte Carlo iterations
const CRITICAL_TIME_MIN = 60;     // "golden hour" threshold

// Uncertainty parameters — derived from rural India road conditions
const TRAVEL_CV   = 0.25;   // coefficient of variation for travel time (25%)
const WAIT_CV     = 0.40;   // wait time is more variable (40%)
const BED_FAIL_P  = 0.15;   // probability a "available" bed is actually occupied

// ─── Math helpers ─────────────────────────────────────────────────────────────

// Box-Muller normal sample: N(mean, std)
const sampleNormal = (mean, std) => {
    const u1 = Math.random(), u2 = Math.random();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(1, mean + z * std);
};

// Log-normal sample (right-skewed — better for travel/wait times)
const sampleLogNormal = (mean, cv) => {
    const sigma2 = Math.log(1 + cv * cv);
    const mu     = Math.log(mean) - sigma2 / 2;
    const z      = sampleNormal(0, 1);
    return Math.max(1, Math.exp(mu + Math.sqrt(sigma2) * z));
};

// Percentile from sorted array
const percentile = (sorted, p) => sorted[Math.floor(sorted.length * p / 100)];


// ═════════════════════════════════════════════════════════════════════════════
//  1. MONTE CARLO PROBABILISTIC ROUTING
// ═════════════════════════════════════════════════════════════════════════════

exports.probabilisticRoute = async (req, res) => {
    const { lat, lon, critical_time = CRITICAL_TIME_MIN, emergency_type = 'general' } = req.body;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const pLat = parseFloat(lat), pLon = parseFloat(lon);
    const userPoint = `ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)`;

    try {
        // Fetch hospital data with routing estimates
        const { rows: hospitals } = await db.query(`
            SELECT
                h.hospital_id,
                h.name,
                h.address,
                ST_X(h.geom) AS lon,
                ST_Y(h.geom) AS lat,
                ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000.0)::numeric, 2) AS dist_km,
                GREATEST(5, ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000.0 / 35.0 * 60)::numeric)) AS travel_min,
                COALESCE(hm.avg_wait_time_minutes, 45)   AS wait_min,
                COALESCE(hm.available_beds, 0)           AS available_beds,
                COALESCE(hm.total_beds, 1)               AS total_beds,
                COALESCE(hm.icu_beds, 0)                 AS icu_beds,
                COALESCE(hm.emergency_level, 1)          AS emergency_level,
                COALESCE(hm.hospital_rating, 3.5)        AS rating,
                -- Current occupancy ratio
                CASE WHEN COALESCE(hm.total_beds,1) > 0
                     THEN 1.0 - (COALESCE(hm.available_beds,0)::float / hm.total_beds)
                     ELSE 0.9 END                        AS occupancy_rate
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
            ORDER BY dist_km ASC
            LIMIT 8;
        `);

        if (!hospitals.length) return res.status(404).json({ error: 'No hospitals found' });

        const critTime = parseFloat(critical_time);

        // ── Monte Carlo for each hospital ─────────────────────────────────────
        const results = hospitals.map(h => {
            const travelMean  = parseFloat(h.travel_min);
            const waitMean    = parseFloat(h.wait_min);
            const occupancy   = parseFloat(h.occupancy_rate);
            const bedFailProb = Math.min(0.95, BED_FAIL_P + occupancy * 0.5);

            const totalTimes    = [];
            let   successCount  = 0;
            let   bedFailCount  = 0;
            let   timeFailCount = 0;

            for (let i = 0; i < N_SIMULATIONS; i++) {
                // Sample uncertain variables
                const sampledTravel = sampleLogNormal(travelMean, TRAVEL_CV);
                const sampledWait   = sampleLogNormal(waitMean,   WAIT_CV);
                const bedAvail      = Math.random() > bedFailProb;  // Bernoulli

                const total = sampledTravel + sampledWait;
                totalTimes.push(total);

                if (!bedAvail)      { bedFailCount++;  continue; }
                if (total > critTime) { timeFailCount++; continue; }
                successCount++;
            }

            // Sort for percentiles
            totalTimes.sort((a, b) => a - b);

            const successProb = successCount / N_SIMULATIONS;

            // Confidence interval on success probability (Wilson score)
            const z   = 1.96;
            const n   = N_SIMULATIONS;
            const p   = successProb;
            const den = 1 + z * z / n;
            const ci_lo = Math.max(0, (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den);
            const ci_hi = Math.min(1, (p + z * z / (2 * n) + z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den);

            return {
                hospital_id:       h.hospital_id,
                hospital_name:     h.name,
                address:           h.address,
                lat:               parseFloat(h.lat),
                lon:               parseFloat(h.lon),
                dist_km:           parseFloat(h.dist_km),

                // Deterministic estimates
                travel_min_est:    Math.round(travelMean),
                wait_min_est:      Math.round(waitMean),

                // Probabilistic results
                success_prob:      Math.round(successProb * 100),
                success_prob_raw:  successProb,
                ci_low:            Math.round(ci_lo * 100),
                ci_high:           Math.round(ci_hi * 100),

                // Percentiles of total time distribution
                p10_min:           Math.round(percentile(totalTimes, 10)),
                p50_min:           Math.round(percentile(totalTimes, 50)),
                p90_min:           Math.round(percentile(totalTimes, 90)),

                // Failure breakdown
                bed_failure_pct:   Math.round(bedFailCount / N_SIMULATIONS * 100),
                time_failure_pct:  Math.round(timeFailCount / N_SIMULATIONS * 100),

                icu_beds:          parseInt(h.icu_beds),
                emergency_level:   parseInt(h.emergency_level),
                rating:            parseFloat(h.rating),
                occupancy_rate:    parseFloat(occupancy.toFixed(2)),

                // Label
                reliability: successProb >= 0.75 ? 'High'
                           : successProb >= 0.50 ? 'Moderate' : 'Low',
                color:       successProb >= 0.75 ? '#16a34a'
                           : successProb >= 0.50 ? '#f59e0b' : '#dc2626',
            };
        });

        // Sort by success probability descending
        results.sort((a, b) => b.success_prob_raw - a.success_prob_raw);
        if (results.length > 0) results[0].is_optimal = true;

        // Explanation: why top != nearest?
        const optimal = results[0];
        const nearest = [...results].sort((a, b) => a.dist_km - b.dist_km)[0];
        let explanation = null;
        if (optimal.hospital_id !== nearest.hospital_id) {
            explanation = `${nearest.hospital_name} is nearer (${nearest.dist_km} km) but only ${nearest.success_prob}% likely to treat you in time. ${optimal.hospital_name} has ${optimal.success_prob}% success probability across ${N_SIMULATIONS} simulations — despite being ${(optimal.dist_km - nearest.dist_km).toFixed(1)} km farther.`;
        }

        res.json({
            n_simulations:  N_SIMULATIONS,
            critical_time,
            emergency_type,
            hospitals:      results,
            optimal,
            explanation,
            uncertainty_model: {
                travel_cv:       `${Math.round(TRAVEL_CV * 100)}% variation`,
                wait_cv:         `${Math.round(WAIT_CV * 100)}% variation`,
                bed_fail_base:   `${Math.round(BED_FAIL_P * 100)}% base rate`,
                distribution:    'Log-normal (right-skewed)',
                note:            'Based on rural India road + hospital variability estimates',
            },
        });

    } catch (err) {
        console.error('[Probabilistic]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// ═════════════════════════════════════════════════════════════════════════════
//  2. MULTI-AGENT HEALTHCARE COORDINATOR
//     Hungarian-inspired weighted assignment:
//     Assign ambulances → patients → hospitals
//     Minimize: Σ(travel_to_patient + travel_to_hospital + wait + overload_penalty)
// ═════════════════════════════════════════════════════════════════════════════

// Haversine distance in km
const haversine = (lat1, lon1, lat2, lon2) => {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const travelMin = (dist_km, speed_kmh = 55) => Math.max(3, (dist_km / speed_kmh) * 60);

exports.coordinateAgents = async (req, res) => {
    const { patients } = req.body;
    // patients: [{ id, lat, lon, severity (1-5), emergency_type, critical_time }]
    if (!patients?.length) return res.status(400).json({ error: 'patients array required' });

    try {
        // ── Fetch available ambulances ─────────────────────────────────────────
        const { rows: ambulances } = await db.query(`
            SELECT ambulance_id, call_sign,
                   lat::float, lon::float,
                   speed_kmh, status
            FROM ambulances
            WHERE status = 'available'
            ORDER BY ambulance_id;
        `);

        // ── Fetch hospital capacity ────────────────────────────────────────────
        const { rows: hospitals } = await db.query(`
            SELECT h.hospital_id, h.name, h.address,
                   ST_X(h.geom) AS lon, ST_Y(h.geom) AS lat,
                   COALESCE(hm.available_beds,  0) AS available_beds,
                   COALESCE(hm.icu_beds,        0) AS icu_beds,
                   COALESCE(hm.emergency_level, 1) AS emergency_level,
                   COALESCE(hm.avg_wait_time_minutes, 45) AS wait_min,
                   COALESCE(hm.hospital_rating, 3.5) AS rating
            FROM hospitals h
            LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
            ORDER BY h.hospital_id;
        `);

        if (!ambulances.length) {
            return res.status(200).json({
                warning:      'No ambulances available — patients must self-transport',
                assignments:  [],
                stats:        { total_patients: patients.length, assigned: 0 },
            });
        }

        // ── Build cost matrix [patient × ambulance] ────────────────────────────
        // Cost = weighted sum of:
        //   1. Ambulance → patient travel time (high weight — urgency)
        //   2. Patient → optimal hospital travel time
        //   3. Hospital wait + overload penalty
        //   4. Severity urgency (higher severity = lower acceptable cost)

        // For each patient, pre-compute best hospitals ranked by composite score
        const patientHospitalScore = patients.map(p => {
            return hospitals.map(h => {
                const dist      = haversine(p.lat, p.lon, parseFloat(h.lat), parseFloat(h.lon));
                const travelT   = travelMin(dist, 40); // patient transport speed
                const waitT     = parseFloat(h.wait_min);
                const overload  = Math.max(0, 1 - parseFloat(h.available_beds) / 10) * 30; // penalty
                const icuBonus  = (p.severity >= 4 && h.icu_beds > 0) ? -15 : 0;
                return {
                    hospital_id:   h.hospital_id,
                    hospital_name: h.name,
                    address:       h.address,
                    hospital_lat:  parseFloat(h.lat),
                    hospital_lon:  parseFloat(h.lon),
                    dist_km:       parseFloat(dist.toFixed(2)),
                    travel_min:    Math.round(travelT),
                    wait_min:      Math.round(waitT),
                    total_cost:    travelT + waitT + overload + icuBonus,
                    available_beds: parseInt(h.available_beds),
                    icu_beds:       parseInt(h.icu_beds),
                    emergency_level: parseInt(h.emergency_level),
                };
            }).sort((a, b) => a.total_cost - b.total_cost);
        });

        // ── Greedy weighted assignment (Hungarian approximation) ───────────────
        // Sort patients by severity DESC (most critical first)
        const sortedPatients = [...patients]
            .map((p, i) => ({ ...p, _origIdx: i }))
            .sort((a, b) => (b.severity || 1) - (a.severity || 1));

        const hospitalLoad    = {};  // track assigned patients per hospital
        const ambulanceUsed   = new Set();
        const assignments     = [];

        for (const patient of sortedPatients) {
            const pidx = patient._origIdx;

            // Find best available ambulance for this patient
            let bestAmb = null, bestAmbCost = Infinity;
            for (const amb of ambulances) {
                if (ambulanceUsed.has(amb.ambulance_id)) continue;
                const d    = haversine(patient.lat, patient.lon, amb.lat, amb.lon);
                const cost = travelMin(d, amb.speed_kmh)
                           * (patient.severity >= 4 ? 2.0 : 1.0); // severity multiplier
                if (cost < bestAmbCost) { bestAmbCost = cost; bestAmb = amb; }
            }

            // Find best hospital (not over capacity, suits severity)
            const hospitalOptions = patientHospitalScore[pidx];
            let bestHosp = null;
            for (const h of hospitalOptions) {
                const load      = hospitalLoad[h.hospital_id] || 0;
                const capacity  = h.available_beds;
                const needsICU  = patient.severity >= 4;
                if (load >= capacity && capacity > 0) continue;  // full
                if (needsICU && h.icu_beds === 0 && hospitalOptions.some(x => x.icu_beds > 0 && (hospitalLoad[x.hospital_id] || 0) < x.available_beds)) continue; // skip no-ICU if better exists
                bestHosp = h;
                break;
            }
            if (!bestHosp) bestHosp = hospitalOptions[0]; // last resort

            // Commit assignment
            if (bestAmb) ambulanceUsed.add(bestAmb.ambulance_id);
            hospitalLoad[bestHosp.hospital_id] = (hospitalLoad[bestHosp.hospital_id] || 0) + 1;

            const ambToPatient  = bestAmb ? haversine(patient.lat, patient.lon, bestAmb.lat, bestAmb.lon) : 0;
            const ambArrivalMin = bestAmb ? Math.round(travelMin(ambToPatient, bestAmb?.speed_kmh || 55)) : null;
            const totalMin      = (ambArrivalMin || 0) + bestHosp.travel_min + bestHosp.wait_min;

            assignments.push({
                patient:   {
                    id:            patient.id || `P${pidx + 1}`,
                    lat:           patient.lat,
                    lon:           patient.lon,
                    severity:      patient.severity || 1,
                    emergency_type: patient.emergency_type || 'general',
                    critical_time: patient.critical_time || CRITICAL_TIME_MIN,
                },
                ambulance: bestAmb ? {
                    ambulance_id:  bestAmb.ambulance_id,
                    call_sign:     bestAmb.call_sign,
                    lat:           bestAmb.lat,
                    lon:           bestAmb.lon,
                    arrival_min:   ambArrivalMin,
                    dist_to_patient_km: parseFloat(ambToPatient.toFixed(2)),
                } : null,
                hospital: {
                    hospital_id:   bestHosp.hospital_id,
                    hospital_name: bestHosp.hospital_name,
                    address:       bestHosp.address,
                    lat:           bestHosp.hospital_lat,
                    lon:           bestHosp.hospital_lon,
                    dist_km:       bestHosp.dist_km,
                    travel_min:    bestHosp.travel_min,
                    wait_min:      bestHosp.wait_min,
                    icu_beds:      bestHosp.icu_beds,
                },
                timeline: {
                    ambulance_arrival_min: ambArrivalMin,
                    hospital_travel_min:   bestHosp.travel_min,
                    hospital_wait_min:     bestHosp.wait_min,
                    total_min:             totalMin,
                    within_critical:       totalMin <= (patient.critical_time || CRITICAL_TIME_MIN),
                },
            });
        }

        // ── System-wide metrics ────────────────────────────────────────────────
        const avgTotal    = Math.round(assignments.reduce((s, a) => s + a.timeline.total_min, 0) / assignments.length);
        const greedyAvg   = Math.round(assignments.reduce((s, a) => s + a.hospital.dist_km / 35 * 60, 0) / assignments.length);
        const withinCrit  = assignments.filter(a => a.timeline.within_critical).length;

        // Hospital load distribution
        const loadDist = hospitals.map(h => ({
            hospital_id:   h.hospital_id,
            hospital_name: h.name,
            assigned:      hospitalLoad[h.hospital_id] || 0,
            capacity:      parseInt(h.available_beds),
            utilization:   `${Math.round((hospitalLoad[h.hospital_id] || 0) / Math.max(1, h.available_beds) * 100)}%`,
        })).filter(h => h.assigned > 0 || h.capacity > 0);

        res.json({
            assignments,
            hospital_load:    loadDist,
            stats: {
                total_patients:   patients.length,
                assigned:         assignments.length,
                ambulances_used:  ambulanceUsed.size,
                ambulances_avail: ambulances.length,
                avg_total_min:    avgTotal,
                greedy_avg_min:   greedyAvg,
                improvement_min:  Math.max(0, greedyAvg - avgTotal),
                within_critical:  withinCrit,
                success_rate_pct: Math.round(withinCrit / assignments.length * 100),
            },
            algorithm: 'Weighted greedy with severity priority + capacity constraints',
        });

    } catch (err) {
        console.error('[Coordinator]', err.message);
        res.status(500).json({ error: err.message });
    }
};


// GET /api/agents/ambulances
exports.getAmbulances = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT a.ambulance_id, a.call_sign, a.lat::float, a.lon::float,
                   a.status, a.speed_kmh, a.equipment,
                   h.name AS base_hospital_name
            FROM ambulances a
            LEFT JOIN hospitals h ON a.base_hospital = h.hospital_id
            ORDER BY a.ambulance_id;
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};