// =============================================================================
//  src/components/analytics/ProbabilisticPanel.jsx
//
//  Monte Carlo probabilistic routing — shows success probability bars,
//  confidence intervals, and uncertainty ranges per hospital.
//  Extends SurvivalScorePanel with stochastic modeling.
//  Results are fed back into Pareto as the 6th dimension (success_probability).
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
    AlertTriangle, RefreshCw, X, TrendingUp,
    BarChart2, Zap, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const EMERGENCY_TYPES = [
    { id: 'heart_attack', label: '❤️ Heart Attack', threshold: 90  },
    { id: 'accident',     label: '🚗 Accident',     threshold: 60  },
    { id: 'stroke',       label: '🧠 Stroke',       threshold: 270 },
    { id: 'pregnancy',    label: '👶 Pregnancy',    threshold: 120 },
    { id: 'general',      label: '🏥 General',      threshold: 180 },
];

// ── Confidence interval bar ───────────────────────────────────────────────────

const CIBar = ({ p5, p50, p95, threshold }) => {
    const max  = Math.max(p95 * 1.1, threshold * 1.1);
    const pPct = v => Math.min(100, (v / max) * 100);

    const barColor = p50 <= threshold * 0.6 ? '#16a34a'
                   : p50 <= threshold       ? '#f59e0b'
                   : '#dc2626';

    return (
        <div className="relative h-5 bg-slate-100 rounded-full overflow-hidden">
            {/* Threshold line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                style={{ left: `${pPct(threshold)}%` }} />
            {/* CI range */}
            <div className="absolute top-1 bottom-1 rounded-full opacity-40"
                style={{
                    left:       `${pPct(p5)}%`,
                    width:      `${pPct(p95) - pPct(p5)}%`,
                    background: barColor,
                }} />
            {/* Median */}
            <div className="absolute top-0 bottom-0 w-1.5 rounded-full"
                style={{ left: `${pPct(p50)}%`, background: barColor }} />
        </div>
    );
};

// ── Hospital row ──────────────────────────────────────────────────────────────

const ProbHospitalRow = ({ h, rank, threshold, onSelect }) => {
    const [open, setOpen] = useState(rank === 1);
    const isBest = h.is_best;
    const probColor = h.success_probability >= 80 ? 'text-green-700 bg-green-50 border-green-300'
                    : h.success_probability >= 55 ? 'text-amber-700 bg-amber-50 border-amber-300'
                    : 'text-red-700 bg-red-50 border-red-300';

    return (
        <div className={`rounded-xl border transition-all ${isBest ? 'border-green-400 ring-2 ring-green-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2.5 p-3 cursor-pointer" onClick={() => setOpen(v => !v)}>
                <div className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 ${isBest ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {isBest ? '★' : rank}
                </div>
                <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm truncate">{h.hospital_name}</p>
                        {isBest && <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">Most Reliable</span>}
                    </div>
                    {/* Probability bar */}
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-grow bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${h.success_probability >= 80 ? 'bg-green-500' : h.success_probability >= 55 ? 'bg-amber-400' : 'bg-red-500'}`}
                                style={{ width: `${h.success_probability}%` }} />
                        </div>
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${probColor}`}>
                            {h.success_probability}%
                        </span>
                    </div>
                </div>
                <div className="text-right flex-shrink-0 text-xs text-slate-500">
                    <div className="font-semibold text-indigo-700">~{h.p50_time_min} min</div>
                    <div>{h.dist_km} km</div>
                </div>
                {open ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
            </div>

            {open && (
                <div className="px-3 pb-3 space-y-2 border-t pt-2">
                    {/* Confidence interval bar */}
                    <div>
                        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>Travel + Wait time distribution (1000 simulations)</span>
                            <span className="text-red-500">⏱ Limit: {threshold} min</span>
                        </div>
                        <CIBar p5={h.p5_time_min} p50={h.p50_time_min} p95={h.p95_time_min} threshold={threshold} />
                        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                            <span>Best case: {h.p5_time_min} min</span>
                            <span>Median: {h.p50_time_min} min</span>
                            <span>Worst case: {h.p95_time_min} min</span>
                        </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                        {[
                            { label: 'Success',    val: `${h.success_probability}%`,  color: h.success_probability >= 70 ? 'text-green-700' : 'text-red-600' },
                            { label: 'Reliability', val: h.reliability,              color: h.reliability === 'High' ? 'text-green-700' : 'text-amber-700' },
                            { label: 'Uncertainty', val: `±${Math.round(h.uncertainty_range / 2)} min`, color: 'text-slate-600' },
                            { label: 'Base travel', val: `${h.travel_min_base} min`, color: 'text-slate-600' },
                            { label: 'ICU beds',    val: h.icu_beds > 0 ? `✓ ${h.icu_beds}` : '✗ None', color: h.icu_beds > 0 ? 'text-green-700' : 'text-red-600' },
                            { label: 'Emerg. Level', val: `Level ${h.emergency_level}`, color: 'text-slate-600' },
                        ].map(({ label, val, color }) => (
                            <div key={label} className="bg-slate-50 rounded-lg p-1.5 text-center">
                                <div className="text-[9px] text-slate-400">{label}</div>
                                <div className={`font-bold text-xs ${color}`}>{val}</div>
                            </div>
                        ))}
                    </div>

                    <button onClick={() => onSelect?.(h.hospital_id)}
                        className="w-full text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-semibold hover:bg-indigo-700">
                        Navigate Here
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Main panel ────────────────────────────────────────────────────────────────

const ProbabilisticPanel = ({ userLocation, onHospitalSelect, onClose, onProbabilityData }) => {
    const [emergencyType, setEmergencyType] = useState('general');
    const [hospitals,     setHospitals]     = useState([]);
    const [insight,       setInsight]       = useState('');
    const [isLoading,     setIsLoading]     = useState(false);
    const [error,         setError]         = useState('');
    const [nSim,          setNSim]          = useState(1000);

    const threshold = EMERGENCY_TYPES.find(e => e.id === emergencyType)?.threshold ?? 180;

    const runSimulation = async () => {
        if (!userLocation) return;
        setIsLoading(true);
        setError('');
        try {
            const res  = await fetch(`${API}/analytics/probabilistic-score`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ lat: userLocation[0], lon: userLocation[1], emergency_type: emergencyType, n_sim: nSim }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setHospitals(data.hospitals ?? []);
            setInsight(data.insight ?? '');
            // Pass probabilities back to parent for Pareto integration
            onProbabilityData?.(data.hospitals ?? []);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { runSimulation(); }, [emergencyType, userLocation]);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] flex flex-col">

                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-indigo-50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <BarChart2 size={20} className="text-indigo-600" />
                        <div>
                            <p className="font-black text-indigo-900">Probabilistic Routing</p>
                            <p className="text-xs text-indigo-600">Monte Carlo · {nSim} simulations · uncertainty-aware</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-indigo-100"><X size={18} /></button>
                </div>

                {/* Emergency type + sim count */}
                <div className="flex-shrink-0 p-3 border-b space-y-2">
                    <div className="grid grid-cols-5 gap-1">
                        {EMERGENCY_TYPES.map(({ id, label }) => (
                            <button key={id} onClick={() => setEmergencyType(id)}
                                className={`text-[11px] px-1.5 py-1.5 rounded-lg border font-semibold transition-all leading-tight text-center ${emergencyType === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                        <Info size={11} className="flex-shrink-0" />
                        <span>Critical threshold for this emergency: <strong className="text-red-600">{threshold} min</strong></span>
                        <select value={nSim} onChange={e => setNSim(Number(e.target.value))}
                            className="ml-auto border rounded px-1.5 py-0.5 text-xs">
                            <option value={200}>200 sims (fast)</option>
                            <option value={1000}>1000 sims</option>
                            <option value={3000}>3000 sims (accurate)</option>
                        </select>
                        <button onClick={runSimulation} className="p-1 hover:bg-slate-100 rounded">
                            <RefreshCw size={12} className={isLoading ? 'animate-spin text-indigo-500' : 'text-slate-500'} />
                        </button>
                    </div>
                </div>

                {/* Insight */}
                {insight && !isLoading && (
                    <div className="flex-shrink-0 mx-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
                        <Zap size={12} className="flex-shrink-0 mt-0.5 text-amber-600" />
                        {insight}
                    </div>
                )}

                {/* Hospital list */}
                <div className="flex-grow overflow-y-auto px-3 py-2 space-y-2">
                    {isLoading && (
                        <div className="text-center py-8">
                            <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-indigo-500" />
                            <p className="text-slate-500 font-semibold text-sm">Running {nSim} simulations per hospital…</p>
                            <p className="text-slate-400 text-xs mt-1">Modeling traffic, wait time, and availability uncertainty</p>
                        </div>
                    )}
                    {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
                    {!isLoading && hospitals.map((h, i) => (
                        <ProbHospitalRow key={h.hospital_id} h={h} rank={i + 1}
                            threshold={threshold}
                            onSelect={(id) => { onHospitalSelect?.(id); onClose?.(); }} />
                    ))}
                </div>

                {/* Legend */}
                {!isLoading && hospitals.length > 0 && (
                    <div className="flex-shrink-0 px-3 pb-3 pt-1 border-t">
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><span className="w-8 h-1.5 bg-green-500 rounded inline-block" /> ≥80% success</span>
                            <span className="flex items-center gap-1"><span className="w-8 h-1.5 bg-amber-400 rounded inline-block" /> 55-80%</span>
                            <span className="flex items-center gap-1"><span className="w-8 h-1.5 bg-red-500 rounded inline-block" /> &lt;55%</span>
                            <span className="flex items-center gap-1 ml-auto"><span className="w-0.5 h-3 bg-red-400 inline-block" /> Time limit</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProbabilisticPanel;