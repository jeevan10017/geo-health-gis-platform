
import React, { useState } from 'react';
import { Trophy, Star, Clock, MapPin, Bed, ChevronDown, ChevronUp, Info } from 'lucide-react';

const costLabel = { 1: 'Govt', 2: 'Mid', 3: 'Pvt' };

// ─── Small stat pill ─────────────────────────────────────────────────────────

const Stat = ({ icon: Icon, value, color = 'text-slate-600' }) => (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
        <Icon size={11} />
        {value}
    </span>
);

// ─── Top-choice card ─────────────────────────────────────────────────────────

const TopChoiceCard = ({ hospital, onClick }) => {
    const distKm = hospital.route_distance_meters != null
        ? (hospital.route_distance_meters / 1000).toFixed(1)
        : hospital.distance_km ?? '—';

    return (
        <div
            onClick={() => onClick(hospital.hospital_id)}
            className="cursor-pointer bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-4 text-white shadow-lg hover:shadow-xl transition-all"
        >
            <div className="flex items-start gap-2 mb-2">
                <Trophy size={18} className="text-yellow-300 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">
                        Top Recommendation
                    </p>
                    <h3 className="font-bold text-base leading-tight mt-0.5 truncate">
                        {hospital.hospital_name || hospital.name}
                    </h3>
                    <p className="text-xs text-indigo-200 mt-0.5 truncate">{hospital.address}</p>
                </div>
                <span className="flex-shrink-0 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-full ml-auto">
                    {hospital.paretoScore}/100
                </span>
            </div>

            <div className="flex flex-wrap gap-3 mt-3 border-t border-indigo-500 pt-3">
                <Stat icon={MapPin} value={`${distKm} km`}     color="text-indigo-200" />
                {hospital.travel_time_minutes != null && (
                    <Stat icon={Clock} value={`~${hospital.travel_time_minutes} min`} color="text-indigo-200" />
                )}
                {hospital.avg_wait_time_minutes != null && (
                    <Stat icon={Clock} value={`${hospital.avg_wait_time_minutes} min wait`} color="text-indigo-200" />
                )}
                {hospital.hospital_rating != null && (
                    <Stat icon={Star} value={`★ ${hospital.hospital_rating}`} color="text-yellow-300" />
                )}
                {hospital.available_beds != null && (
                    <Stat icon={Bed} value={`${hospital.available_beds} beds`} color="text-indigo-200" />
                )}
            </div>

            <p className="text-xs text-indigo-300 mt-2">
                Pareto-optimal - no other hospital beats this across all your priorities.
            </p>
        </div>
    );
};

// ─── Pareto front summary row ────────────────────────────────────────────────

const ParetoRow = ({ hospital, rank, onClick }) => {
    const distKm = hospital.route_distance_meters != null
        ? (hospital.route_distance_meters / 1000).toFixed(1)
        : hospital.distance_km ?? '—';

    return (
        <div
            onClick={() => onClick(hospital.hospital_id)}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-indigo-50 cursor-pointer border border-transparent hover:border-indigo-200 transition-all"
        >
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {rank}
            </span>
            <div className="flex-grow min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                    {hospital.hospital_name || hospital.name}
                </p>
                <div className="flex flex-wrap gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{distKm} km</span>
                    {hospital.avg_wait_time_minutes != null && (
                        <span className="text-xs text-slate-500">{hospital.avg_wait_time_minutes} min wait</span>
                    )}
                    {hospital.hospital_rating != null && (
                        <span className="text-xs text-amber-600">★ {hospital.hospital_rating}</span>
                    )}
                    {hospital.cost_level && (
                        <span className="text-xs text-slate-500">{costLabel[hospital.cost_level]}</span>
                    )}
                </div>
            </div>
            <span className="flex-shrink-0 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                {hospital.paretoScore}
            </span>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ParetoRecommendation = ({ topChoice, paretoFront, onHospitalSelect }) => {
    const [expanded, setExpanded] = useState(false);

    if (!topChoice) return null;

    // Other Pareto hospitals (exclude top choice)
    const others = paretoFront
        .filter(h => h.hospital_id !== topChoice.hospital_id)
        .sort((a, b) => b.paretoScore - a.paretoScore);

    return (
        <div className="space-y-2 mb-3">
            <TopChoiceCard hospital={topChoice} onClick={onHospitalSelect} />

            {others.length > 0 && (
                <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <span className="flex items-center gap-2">
                            <Info size={14} className="text-indigo-500" />
                            {others.length} other Pareto-optimal option{others.length > 1 ? 's' : ''}
                        </span>
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {expanded && (
                        <div className="px-2 pb-2 divide-y divide-slate-100">
                            {others.map((h, i) => (
                                <ParetoRow
                                    key={h.hospital_id}
                                    hospital={h}
                                    rank={i + 2}
                                    onClick={onHospitalSelect}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-start gap-1.5 px-1">
                <Info size={11} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-tight">
                    Pareto-optimal means no single hospital beats these in <em>all</em> categories simultaneously.
                    The score reflects your stated priorities.
                </p>
            </div>
        </div>
    );
};

export default ParetoRecommendation;