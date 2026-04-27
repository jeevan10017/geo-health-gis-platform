// =============================================================================
//  src/components/analytics/AdvancedParetoPanel.jsx
//
//  ONE unified panel that replaces:
//    - Emergency mode
//    - Survival Route panel
//    - Probabilistic panel
//    - Pareto (already in main list, now enriched here)
//
//  How it works:
//    1. User picks emergency type (optional)
//    2. Backend runs THREE algorithms simultaneously:
//         a. Survival Score  (ICU, specialist, wait, travel weights per emergency)
//         b. Monte Carlo x500 (success probability under uncertainty)
//         c. Pareto 6D        (distance, wait, rating, cost, beds, probability)
//    3. Scores are FUSED into one composite rank:
//         composite = 0.35×survival + 0.35×probability + 0.30×pareto_score
//    4. Shows ONE ranked list with per-algorithm score breakdown
//    5. Top card = "Overall Best" with full explanation
//    6. Emergency Multi-Patient tab runs Hungarian assignment
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
    X, RefreshCw, ChevronDown, ChevronUp,
    Zap, BarChart2, Users, Star, Clock, Activity, AlertTriangle,
} from 'lucide-react';
import { annotateWithPareto } from '../../utils/pareto';

const API = import.meta.env.VITE_API_URL || '/api';

// ─── Emergency types ──────────────────────────────────────────────────────────

const EMERGENCY_TYPES = [
    { id: 'general',      label: '🏥 General',      color: 'indigo' },
    { id: 'heart_attack', label: '❤️ Heart Attack', color: 'red'    },
    { id: 'accident',     label: '🚗 Accident',     color: 'orange' },
    { id: 'stroke',       label: '🧠 Stroke',       color: 'purple' },
    { id: 'pregnancy',    label: '👶 Pregnancy',    color: 'pink'   },
];

// ─── Score bar ────────────────────────────────────────────────────────────────

const ScoreBar = ({ label, value, max = 100, color = 'indigo' }) => {
    const pct = Math.round((value / max) * 100);
    const colors = {
        indigo: 'bg-indigo-500', green: 'bg-green-500',
        amber: 'bg-amber-400', red: 'bg-red-500', purple: 'bg-purple-500',
    };
    const barColor = value >= 70 ? colors.green : value >= 45 ? colors.amber : colors.red;
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 w-20 flex-shrink-0">{label}</span>
            <div className="flex-grow bg-slate-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="font-bold text-slate-700 w-8 text-right">{value}</span>
        </div>
    );
};

// ─── Hospital card ────────────────────────────────────────────────────────────

const RankedCard = ({ hospital, rank, onSelect }) => {
    const [open, setOpen] = useState(rank === 1);
    const isBest = rank === 1;

    const composite = hospital._composite ?? 0;
    const compColor  = composite >= 70 ? 'text-green-700 bg-green-50 border-green-300'
                     : composite >= 50 ? 'text-amber-700 bg-amber-50 border-amber-300'
                     : 'text-red-700 bg-red-50 border-red-300';

    return (
        <div className={`rounded-xl border transition-all ${isBest ? 'border-green-400 ring-2 ring-green-100 bg-green-50/30' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-2.5 p-3 cursor-pointer" onClick={() => setOpen(v => !v)}>
                {/* Rank badge */}
                <div className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 ${isBest ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {isBest ? '★' : rank}
                </div>

                <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm truncate">{hospital.hospital_name}</p>
                        {isBest && <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">Overall Best</span>}
                        {hospital.isPareto && rank > 1 && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-200">Pareto ✓</span>}
                    </div>
                    {/* Composite score bar */}
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-grow bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${composite >= 70 ? 'bg-green-500' : composite >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                                style={{ width: `${composite}%` }} />
                        </div>
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${compColor}`}>{composite}</span>
                    </div>
                </div>

                <div className="text-right flex-shrink-0 text-xs">
                    <div className="font-semibold text-indigo-700">{hospital.travel_min ?? hospital.travel_time_minutes ?? '—'} min</div>
                    <div className="text-slate-400">{hospital.dist_km ?? ((hospital.route_distance_meters ?? 0) / 1000).toFixed(1)} km</div>
                </div>
                {open ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
            </div>

            {open && (
                <div className="px-3 pb-3 border-t pt-2 space-y-2">
                    {/* Score breakdown */}
                    <div className="space-y-1.5">
                        <ScoreBar label="Survival"     value={hospital.survival_score  ?? 50} />
                        <ScoreBar label="Probability"  value={hospital.success_probability ?? 50} />
                        <ScoreBar label="Pareto Score" value={hospital.paretoScore ?? 50} />
                        <ScoreBar label="Composite"    value={composite} />
                    </div>

                    {/* Key facts */}
                    <div className="flex gap-1.5 flex-wrap text-[10px]">
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${hospital.icu_beds > 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
                            {hospital.icu_beds > 0 ? `✓ ICU (${hospital.icu_beds})` : '✗ No ICU'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                            ⏱ {hospital.wait_min ?? hospital.avg_wait_time_minutes ?? '?'} min wait
                        </span>
                        {hospital.specialist_on_duty && (
                            <span className="px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">Specialist ✓</span>
                        )}
                        {hospital.success_probability && (
                            <span className="px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
                                {hospital.success_probability}% success
                            </span>
                        )}
                    </div>

                    {/* Explanation for top choice */}
                    {isBest && hospital._explanation && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-800 flex items-start gap-1.5">
                            <Zap size={11} className="flex-shrink-0 mt-0.5 text-green-600" />
                            {hospital._explanation}
                        </div>
                    )}

                    <button onClick={() => onSelect?.(hospital.hospital_id)}
                        className="w-full text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-semibold hover:bg-indigo-700 transition-colors">
                        Navigate Here
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Multi-patient tab ────────────────────────────────────────────────────────

const SCENARIOS = {
    'Demo 3':     [
        { id:'P1', lat:22.3276, lon:87.3147, severity:4, emergency_type:'heart_attack' },
        { id:'P2', lat:22.4246, lon:87.3224, severity:3, emergency_type:'accident'     },
        { id:'P3', lat:22.6570, lon:87.7379, severity:5, emergency_type:'stroke'       },
    ],
    'Mass 5': [
        { id:'P1', lat:22.32, lon:87.31, severity:5, emergency_type:'accident'     },
        { id:'P2', lat:22.35, lon:87.34, severity:4, emergency_type:'accident'     },
        { id:'P3', lat:22.31, lon:87.29, severity:3, emergency_type:'general'      },
        { id:'P4', lat:22.65, lon:87.73, severity:4, emergency_type:'heart_attack' },
        { id:'P5', lat:22.22, lon:87.13, severity:2, emergency_type:'general'      },
    ],
};

const SEV_COLOR = { 1:'#16a34a', 2:'#65a30d', 3:'#f59e0b', 4:'#f97316', 5:'#dc2626' };

const MultiTab = ({ userLocation }) => {
    const [patients, setPatients] = useState(SCENARIOS['Demo 3']);
    const [result,   setResult]   = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [scenario, setScenario] = useState('Demo 3');

    const run = async () => {
        setLoading(true);
        try {
            const res  = await fetch(`${API}/analytics/multi-agent-assign`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patients }),
            });
            setResult(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-3">
            {/* Scenario selector */}
            <div className="flex gap-1.5 flex-wrap">
                {Object.keys(SCENARIOS).map(s => (
                    <button key={s} onClick={() => { setScenario(s); setPatients(SCENARIOS[s]); setResult(null); }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${scenario === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Patient list */}
            <div className="space-y-1.5">
                {patients.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border text-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                            style={{ background: SEV_COLOR[p.severity] }}>
                            {p.id}
                        </div>
                        <span className="flex-grow">{p.emergency_type.replace('_', ' ')}</span>
                        <span className="font-semibold" style={{ color: SEV_COLOR[p.severity] }}>Sev {p.severity}</span>
                    </div>
                ))}
            </div>

            <button onClick={run} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-purple-700">
                {loading ? <><RefreshCw size={14} className="animate-spin" /> Assigning…</> : <><Users size={14} /> Optimal Assignment</>}
            </button>

            {/* Results */}
            {result?.assignments && (
                <div className="space-y-2">
                    <div className="flex gap-2 text-xs">
                        <div className="flex-1 bg-purple-50 border border-purple-200 rounded-lg p-2 text-center">
                            <div className="text-purple-400 text-[10px]">Avg ETA</div>
                            <div className="font-black text-purple-700">{result.system_metrics.avg_eta_min}min</div>
                        </div>
                        <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                            <div className="text-green-400 text-[10px]">Load Balance</div>
                            <div className="font-black text-green-700">{result.system_metrics.load_balance_score}%</div>
                        </div>
                    </div>
                    {result.assignments.map(a => (
                        <div key={a.patient_id} className="flex items-center gap-2 text-xs border rounded-lg p-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                                style={{ background: SEV_COLOR[a.severity] }}>{a.patient_id}</div>
                            <div className="flex-grow min-w-0">
                                <span className="font-bold text-indigo-700 truncate block">{a.assigned_hospital?.hospital_name}</span>
                                <span className="text-slate-400">{a.eta_min}min · {a.assigned_hospital?.dist_km}km</span>
                            </div>
                            {!a.greedy_would_choose && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded-full border border-green-200 font-bold flex-shrink-0">↑ Better</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// ─── Main Panel ───────────────────────────────────────────────────────────────

const AdvancedParetoPanel = ({ userLocation, hospitals: hospitalList, onHospitalSelect, onAnnotated, onClose }) => {
    const [emergencyType, setEmergencyType] = useState('general');
    const [ranked,        setRanked]        = useState([]);
    const [loading,       setLoading]       = useState(false);
    const [error,         setError]         = useState('');
    const [tab,           setTab]           = useState('rank');  // 'rank' | 'multi'
    const [explanation,   setExplanation]   = useState('');

    const runAll = useCallback(async () => {
        if (!userLocation) return;
        setLoading(true);
        setError('');

        try {
            const [survRes, probRes] = await Promise.all([
                fetch(`${API}/analytics/survival-score`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: userLocation[0], lon: userLocation[1], emergency_type: emergencyType }),
                }),
                fetch(`${API}/analytics/probabilistic-score`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: userLocation[0], lon: userLocation[1], emergency_type: emergencyType, n_sim: 500 }),
                }),
            ]);

            const [survData, probData] = await Promise.all([survRes.json(), probRes.json()]);

            // ── Merge survival + probability + pareto into one list ────────────

            // Base: survival data (has ICU, specialist, dist_km)
            const survMap = new Map((survData.hospitals ?? []).map(h => [h.hospital_id, h]));
            const probMap = new Map((probData.hospitals ?? []).map(h => [h.hospital_id, h]));

            // Union of all hospital IDs
            const allIds = new Set([...survMap.keys(), ...probMap.keys()]);

            const merged = [...allIds].map(id => {
                const s = survMap.get(id) ?? {};
                const p = probMap.get(id) ?? {};
                return {
                    ...s,
                    ...p,
                    hospital_id:         id,
                    hospital_name:       s.hospital_name ?? p.hospital_name,
                    dist_km:             s.dist_km ?? p.dist_km,
                    travel_min:          s.travel_min ?? p.travel_min_base,
                    wait_min:            s.wait_min ?? p.wait_min_base ?? s.avg_wait_time_minutes,
                    // Keep both scores
                    survival_score:      s.survival_score ?? 50,
                    success_probability: p.success_probability ?? 50,
                    // For pareto dims
                    route_distance_meters: (s.dist_km ?? p.dist_km ?? 0) * 1000,
                    avg_wait_time_minutes: s.wait_min ?? p.wait_min_base ?? 45,
                    hospital_rating:       s.rating ?? 3,
                    cost_level:            s.cost_level ?? 2,
                    available_beds:        s.available_beds ?? 0,
                };
            });

            // ── Run Pareto on the merged list ─────────────────────────────────
            const withPareto = annotateWithPareto(merged, {
                distance:    0.20,
                waitTime:    0.15,
                rating:      0.15,
                cost:        0.10,
                beds:        0.10,
                probability: 0.30,   // probability gets more weight in emergency context
            });

            // ── Compute composite score ───────────────────────────────────────
            // composite = 0.35 × survival_score (0-100)
            //           + 0.35 × success_probability (0-100)
            //           + 0.30 × pareto_score (0-100)
            const withComposite = withPareto.map(h => ({
                ...h,
                _composite: Math.round(
                    0.35 * (h.survival_score      ?? 50) +
                    0.35 * (h.success_probability  ?? 50) +
                    0.30 * (h.paretoScore          ?? 50)
                ),
            }));

            // Sort by composite descending
            withComposite.sort((a, b) => b._composite - a._composite);

            // Best vs nearest explanation
            const best    = withComposite[0];
            const nearest = [...withComposite].sort((a, b) => (a.dist_km ?? 99) - (b.dist_km ?? 99))[0];
            let expl = '';
            if (best.hospital_id !== nearest.hospital_id) {
                const reasons = [];
                if ((best.survival_score ?? 0) > (nearest.survival_score ?? 0) + 5)
                    reasons.push(`higher survival score (${best.survival_score} vs ${nearest.survival_score})`);
                if ((best.success_probability ?? 0) > (nearest.success_probability ?? 0) + 5)
                    reasons.push(`${best.success_probability}% vs ${nearest.success_probability}% success under uncertainty`);
                if (best.icu_beds > 0 && !(nearest.icu_beds > 0))
                    reasons.push('ICU available');
                if (best.specialist_on_duty && !nearest.specialist_on_duty)
                    reasons.push('specialist on duty now');
                if (reasons.length)
                    expl = `${best.hospital_name} is ${((best.dist_km ?? 0) - (nearest.dist_km ?? 0)).toFixed(1)} km farther but: ${reasons.join(', ')}.`;
            }

            if (withComposite.length > 0) {
                withComposite[0]._explanation = expl || `${best.hospital_name} scores highest across all ${emergencyType === 'general' ? '' : emergencyType.replace('_', ' ') + ' '}metrics.`;
            }

            setRanked(withComposite);
            setExplanation(expl);

            // Pass enriched data back to parent to update main list
            onAnnotated?.(withComposite);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [userLocation, emergencyType, onAnnotated]);

    useEffect(() => { runAll(); }, [emergencyType]);

    const best = ranked[0];

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] flex flex-col">

                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-green-50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <Star size={20} className="text-indigo-600" />
                        <div>
                            <p className="font-black text-slate-800">Advanced Pareto Optimal</p>
                            <p className="text-xs text-slate-500">Survival · Monte Carlo · Pareto · fused score</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100"><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div className="flex-shrink-0 flex border-b">
                    <button onClick={() => setTab('rank')}
                        className={`flex-1 py-2 text-xs font-bold transition-all ${tab === 'rank' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        ⭐ Advanced Pareto
                    </button>
                    <button onClick={() => setTab('multi')}
                        className={`flex-1 py-2 text-xs font-bold transition-all ${tab === 'multi' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        👥 Multi-Patient
                    </button>
                </div>

                {/* Emergency type selector */}
                {tab === 'rank' && (
                    <div className="flex-shrink-0 px-3 py-2.5 border-b">
                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide flex-shrink-0">Condition:</span>
                            {EMERGENCY_TYPES.map(({ id, label }) => (
                                <button key={id} onClick={() => setEmergencyType(id)}
                                    className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${emergencyType === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                    {label}
                                </button>
                            ))}
                            <button onClick={runAll} className="ml-auto p-1 hover:bg-slate-100 rounded-full">
                                <RefreshCw size={13} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Best choice summary bar */}
                {tab === 'rank' && best && !loading && (
                    <div className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-green-50 to-indigo-50 border-b">
                        <div className="flex items-center gap-3">
                            <div className="text-center flex-shrink-0">
                                <div className={`text-2xl font-black ${best._composite >= 70 ? 'text-green-600' : best._composite >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {best._composite}
                                </div>
                                <div className="text-[9px] text-slate-400">composite</div>
                            </div>
                            <div className="flex-grow min-w-0">
                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">⭐ Best Overall</p>
                                <p className="font-black text-slate-800 text-sm truncate">{best.hospital_name}</p>
                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                    <span>{best.travel_min}min</span>
                                    <span>{best.dist_km}km</span>
                                    {best.icu_beds > 0 && <span className="text-green-600 font-semibold">✓ ICU</span>}
                                    {best.success_probability && <span className="text-indigo-600 font-semibold">{best.success_probability}% success</span>}
                                </div>
                            </div>
                        </div>
                        {best._explanation && (
                            <p className="text-[10px] text-slate-600 mt-1.5 bg-white/70 rounded-lg px-2 py-1 border border-green-200">
                                <Zap size={9} className="inline text-amber-500 mr-1" />{best._explanation}
                            </p>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-grow overflow-y-auto px-3 py-2 space-y-2">
                    {tab === 'rank' && (
                        <>
                            {loading && (
                                <div className="text-center py-8">
                                    <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-indigo-500" />
                                    <p className="text-slate-500 font-semibold text-sm">Running all algorithms…</p>
                                    <p className="text-slate-400 text-xs mt-1">Survival · 500 Monte Carlo sims · 6D Pareto</p>
                                </div>
                            )}
                            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
                            {!loading && ranked.map((h, i) => (
                                <RankedCard key={h.hospital_id} hospital={h} rank={i + 1}
                                    onSelect={(id) => { onHospitalSelect?.(id); onClose?.(); }} />
                            ))}

                            {/* Score legend */}
                            {!loading && ranked.length > 0 && (
                                <div className="text-[10px] text-slate-400 border-t pt-2 flex items-center gap-2 flex-wrap">
                                    <BarChart2 size={10} />
                                    <span>Composite = 35% Survival + 35% Monte Carlo + 30% Pareto</span>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'multi' && <MultiTab userLocation={userLocation} />}
                </div>
            </div>
        </div>
    );
};

export default AdvancedParetoPanel;