
export const DEFAULT_WEIGHTS = {
    distance:  0.30,   // lower  = better
    waitTime:  0.25,   // lower  = better
    rating:    0.25,   // higher = better
    cost:      0.10,   // lower  = better
    beds:      0.10,   // higher = better
};

// ─── Normalise a raw value into [0, 1] (higher = better after inversion) ─────

const normalise = (value, min, max, lowerIsBetter) => {
    if (max === min) return 0.5;
    const ratio = (value - min) / (max - min);          // 0 = worst, 1 = best (raw)
    return lowerIsBetter ? 1 - ratio : ratio;
};

// ─── Extract numeric dimensions from a hospital object ───────────────────────

const dims = (h) => ({
    distance: parseFloat(h.route_distance_meters ?? h.distance_km * 1000 ?? Infinity) / 1000,
    waitTime: parseFloat(h.avg_wait_time_minutes ?? 999),
    rating:   parseFloat(h.hospital_rating       ?? 0),
    cost:     parseFloat(h.cost_level            ?? 3),
    beds:     parseFloat(h.available_beds        ?? 0),
});

// ─── Does H1 dominate H2? ────────────────────────────────────────────────────

const dominates = (h1, h2) => {
    const d1 = dims(h1);
    const d2 = dims(h2);

    // Lower is better for distance / waitTime / cost
    // Higher is better for rating / beds
    const atLeastAsGood =
        d1.distance <= d2.distance &&
        d1.waitTime <= d2.waitTime &&
        d1.rating   >= d2.rating   &&
        d1.cost     <= d2.cost     &&
        d1.beds     >= d2.beds;

    const strictlyBetterInOne =
        d1.distance < d2.distance ||
        d1.waitTime < d2.waitTime ||
        d1.rating   > d2.rating   ||
        d1.cost     < d2.cost     ||
        d1.beds     > d2.beds;

    return atLeastAsGood && strictlyBetterInOne;
};

// ─── Compute Pareto front ────────────────────────────────────────────────────

/**
 * Returns the subset of hospitals that are NOT dominated by any other hospital.
 * @param {object[]} hospitals
 * @returns {object[]}  Pareto-optimal hospitals
 */
export const computeParetoFront = (hospitals) => {
    if (!hospitals?.length) return [];
    return hospitals.filter(h =>
        !hospitals.some(other => other !== h && dominates(other, h))
    );
};

// ─── Weighted score on the Pareto front ──────────────────────────────────────

/**
 * Score every hospital against user weights.
 * Each dimension is normalised across the full list (not just Pareto front)
 * so scores are comparable even when displayed on the main list.
 *
 * @param {object[]} hospitals   Full list
 * @param {object}   weights     { distance, waitTime, rating, cost, beds }
 * @returns {object[]}  Same hospitals with added `paretoScore` field (0–100)
 */
export const scoreHospitals = (hospitals, weights = DEFAULT_WEIGHTS) => {
    if (!hospitals?.length) return [];

    const all = hospitals.map(dims);

    const ranges = {
        distance: { min: Math.min(...all.map(d => d.distance)), max: Math.max(...all.map(d => d.distance)) },
        waitTime: { min: Math.min(...all.map(d => d.waitTime)), max: Math.max(...all.map(d => d.waitTime)) },
        rating:   { min: Math.min(...all.map(d => d.rating)),   max: Math.max(...all.map(d => d.rating))   },
        cost:     { min: Math.min(...all.map(d => d.cost)),     max: Math.max(...all.map(d => d.cost))     },
        beds:     { min: Math.min(...all.map(d => d.beds)),     max: Math.max(...all.map(d => d.beds))     },
    };

    const w = { ...DEFAULT_WEIGHTS, ...weights };

    return hospitals.map((h, i) => {
        const d = all[i];
        const score =
            w.distance * normalise(d.distance, ranges.distance.min, ranges.distance.max, true)  +
            w.waitTime * normalise(d.waitTime, ranges.waitTime.min, ranges.waitTime.max, true)  +
            w.rating   * normalise(d.rating,   ranges.rating.min,   ranges.rating.max,   false) +
            w.cost     * normalise(d.cost,     ranges.cost.min,     ranges.cost.max,     true)  +
            w.beds     * normalise(d.beds,     ranges.beds.min,     ranges.beds.max,     false);

        return { ...h, paretoScore: Math.round(score * 100) };
    });
};

// ─── Full pipeline: score + mark Pareto + sort ───────────────────────────────

/**
 * Main entry point.
 * Returns the full list with:
 *   - `paretoScore`    0–100 weighted score
 *   - `isPareto`       true if on the Pareto front
 *   - `isTopChoice`    true for the single highest-scoring Pareto hospital
 *
 * List is returned in original order (caller can sort as needed).
 *
 * @param {object[]} hospitals
 * @param {object}   weights
 * @returns {object[]}
 */
export const annotateWithPareto = (hospitals, weights = DEFAULT_WEIGHTS) => {
    if (!hospitals?.length) return [];

    const scored  = scoreHospitals(hospitals, weights);
    const front   = computeParetoFront(scored);
    const frontIds = new Set(front.map(h => h.hospital_id));

    // Find top choice: highest score among Pareto-optimal hospitals
    let topId = null;
    let topScore = -1;
    front.forEach(h => {
        const s = scored.find(s => s.hospital_id === h.hospital_id)?.paretoScore ?? 0;
        if (s > topScore) { topScore = s; topId = h.hospital_id; }
    });

    return scored.map(h => ({
        ...h,
        isPareto:    frontIds.has(h.hospital_id),
        isTopChoice: h.hospital_id === topId,
    }));
};