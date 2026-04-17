
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Heart, Car, Baby, Brain, Activity, X, Star, Clock, Bed, Zap, ChevronDown, ChevronUp } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const EMERGENCY_TYPES = [
    { id: 'heart_attack', label: 'Heart Attack',  icon: Heart,         color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-300'   },
    { id: 'accident',     label: 'Accident',       icon: Car,           color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-300'},
    { id: 'stroke',       label: 'Stroke',         icon: Brain,         color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-300'},
    { id: 'pregnancy',    label: 'Pregnancy',      icon: Baby,          color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-300'  },
    { id: 'general',      label: 'General Emerg.', icon: Activity,      color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-300'},
];

// Circular score gauge
const ScoreGauge = ({ score, size = 64 }) => {
    const r   = (size / 2) - 6;
    const circ = 2 * Math.PI * r;
    const fill  = (score / 100) * circ;
    const color = score >= 75 ? '#16a34a' : score >= 50 ? '#f59e0b' : '#dc2626';

    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
                strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
                style={{ transform: `rotate(90deg) translate(0, -${size/2}px)`, fontSize: 14, fontWeight: 900, fill: color }}>
                {score}%
            </text>
        </svg>
    );
};

const HospitalSurvivalCard = ({ hospital, rank, onSelect }) => {
    const [expanded, setExpanded] = useState(rank === 1);
    const isBest = hospital.is_best;

    const barColor = hospital.survival_score >= 75 ? 'bg-green-500'
                   : hospital.survival_score >= 50 ? 'bg-amber-400' : 'bg-red-500';

    return (
        <div className={`rounded-xl border transition-all ${isBest ? 'border-green-400 ring-2 ring-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
            <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => setExpanded(v => !v)}
            >
                {/* Rank */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isBest ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {isBest ? '★' : rank}
                </div>

                {/* Name + score bar */}
                <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm truncate">{hospital.hospital_name}</p>
                        {isBest && <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">Best Survival</span>}
                        {hospital.specialist_on_duty && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-200">Specialist ✓</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-grow bg-slate-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${hospital.survival_score}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{hospital.survival_score}%</span>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-indigo-700">{hospital.travel_min} min</p>
                    <p className="text-[10px] text-slate-500">{hospital.dist_km} km</p>
                </div>

                {expanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
            </div>

            {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t pt-2">
                    {/* Score breakdown */}
                    <div className="grid grid-cols-2 gap-1.5">
                        {[
                            { label: 'Travel Time', score: hospital.time_score,       icon: Clock     },
                            { label: 'Wait Time',   score: hospital.wait_score,       icon: Clock     },
                            { label: 'ICU Access',  score: hospital.icu_score,        icon: Activity  },
                            { label: 'Bed Avail.',  score: hospital.bed_score,        icon: Bed       },
                            { label: 'Specialist',  score: hospital.specialist_score, icon: Star      },
                        ].map(({ label, score, icon: Icon }) => (
                            <div key={label} className="flex items-center gap-1.5 text-xs">
                                <Icon size={11} className="text-slate-400 flex-shrink-0" />
                                <span className="text-slate-600 flex-grow">{label}</span>
                                <div className="w-16 bg-slate-100 rounded-full h-1">
                                    <div className="h-1 rounded-full bg-indigo-400" style={{ width: `${score}%` }} />
                                </div>
                                <span className="text-slate-500 font-mono text-[10px] w-6 text-right">{score}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 flex-wrap text-[10px]">
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${hospital.icu_beds > 0 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-500 border-red-200'}`}>
                            {hospital.icu_beds > 0 ? `✓ ${hospital.icu_beds} ICU beds` : '✗ No ICU'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${hospital.ambulance ? 'bg-green-100 text-green-700 border-green-300' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {hospital.ambulance ? '✓ Ambulance' : '✗ No Ambulance'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                            ⏱ {hospital.wait_min} min wait
                        </span>
                    </div>

                    <button
                        onClick={() => onSelect?.(hospital)}
                        className="w-full text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-semibold hover:bg-indigo-700 transition-colors"
                    >
                        Navigate Here
                    </button>
                </div>
            )}
        </div>
    );
};

const SurvivalScorePanel = ({ userLocation, onHospitalSelect, onClose }) => {
    const [emergencyType, setEmergencyType] = useState('general');
    const [hospitals,     setHospitals]     = useState([]);
    const [explanation,   setExplanation]   = useState('');
    const [isLoading,     setIsLoading]     = useState(false);
    const [error,         setError]         = useState('');

    const runAnalysis = async () => {
        if (!userLocation) return;
        setIsLoading(true);
        setError('');
        try {
            const res  = await fetch(`${API}/analytics/survival-score`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    lat:            userLocation[0],
                    lon:            userLocation[1],
                    emergency_type: emergencyType,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setHospitals(data.hospitals ?? []);
            setExplanation(data.explanation ?? '');
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { runAnalysis(); }, [emergencyType, userLocation]);

    const best = hospitals[0];
    const ActiveIcon = EMERGENCY_TYPES.find(e => e.id === emergencyType)?.icon ?? Activity;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] flex flex-col">

                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-red-50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={20} className="text-red-600" />
                        <div>
                            <p className="font-black text-red-800">Survival-Aware Routing</p>
                            <p className="text-xs text-red-600">Best hospital for survival — not just nearest</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-red-100"><X size={18} /></button>
                </div>

                {/* Emergency type selector */}
                <div className="flex-shrink-0 p-3 border-b">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Emergency Type</p>
                    <div className="grid grid-cols-5 gap-1.5">
                        {EMERGENCY_TYPES.map(({ id, label, icon: Icon, color, bg, border }) => (
                            <button
                                key={id}
                                onClick={() => setEmergencyType(id)}
                                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-semibold transition-all ${
                                    emergencyType === id ? `${bg} ${color} ${border} ring-2 ring-offset-1` : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <Icon size={16} />
                                <span className="leading-tight text-center text-[10px]">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Best choice summary */}
                {best && !isLoading && (
                    <div className="flex-shrink-0 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                        <div className="flex items-center gap-3">
                            <ScoreGauge score={best.survival_score} size={64} />
                            <div className="flex-grow">
                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider">🔥 Best Survival Choice</p>
                                <p className="font-black text-slate-800">{best.hospital_name}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                                    <span className="flex items-center gap-1"><Clock size={11} /> {best.travel_min} min</span>
                                    <span>{best.dist_km} km</span>
                                    {best.icu_beds > 0 && <span className="text-green-600 font-semibold">✓ ICU</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-green-700">Confidence</p>
                                <p className={`text-sm font-black ${best.confidence === 'High' ? 'text-green-600' : best.confidence === 'Moderate' ? 'text-amber-600' : 'text-red-500'}`}>
                                    {best.confidence}
                                </p>
                            </div>
                        </div>
                        {explanation && (
                            <div className="mt-2 text-xs text-slate-600 bg-white/70 rounded-lg px-2.5 py-1.5 border border-green-200">
                                <Zap size={11} className="inline text-amber-500 mr-1" />
                                {explanation}
                            </div>
                        )}
                    </div>
                )}

                {/* Hospital list */}
                <div className="flex-grow overflow-y-auto px-3 py-2 space-y-2">
                    {isLoading && (
                        <div className="text-center py-8 text-slate-500">
                            <Activity size={32} className="animate-pulse mx-auto mb-2 text-red-400" />
                            <p className="font-semibold">Computing survival scores…</p>
                        </div>
                    )}
                    {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
                    {!isLoading && hospitals.map((h, i) => (
                        <HospitalSurvivalCard
                            key={h.hospital_id}
                            hospital={h}
                            rank={i + 1}
                            onSelect={(h) => { onHospitalSelect?.(h.hospital_id); onClose?.(); }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SurvivalScorePanel;