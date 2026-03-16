
import React, { useState } from 'react';
import { Clock, Car, MapPin, Star, ChevronDown, ChevronUp, Zap, AlertTriangle, Trophy } from 'lucide-react';

// ── Specialization color pill ──────────────────────────────────────────────

const SPEC_COLORS = {
    'Cardiology':       'bg-red-100 text-red-700',
    'Pediatrics':       'bg-blue-100 text-blue-700',
    'Orthopedics':      'bg-orange-100 text-orange-700',
    'Gynaecology':      'bg-pink-100 text-pink-700',
    'General Medicine': 'bg-green-100 text-green-700',
    'Dermatology':      'bg-yellow-100 text-yellow-700',
    'ENT':              'bg-purple-100 text-purple-700',
    'Neurology':        'bg-indigo-100 text-indigo-700',
    'Pulmonology':      'bg-teal-100 text-teal-700',
    'Oncology':         'bg-rose-100 text-rose-700',
    'Psychiatry':       'bg-violet-100 text-violet-700',
    'Ophthalmology':    'bg-sky-100 text-sky-700',
    'Surgeon':          'bg-amber-100 text-amber-700',
};
const specColor = (s) => SPEC_COLORS[s] ?? 'bg-slate-100 text-slate-700';

// ── Time remaining bar ────────────────────────────────────────────────────

const TimeBar = ({ remainingMin, travelMin }) => {
    const total    = Math.max(remainingMin, travelMin + 5);
    const travelPct  = Math.min(100, Math.round((travelMin / total) * 100));
    const windowPct  = Math.max(0, Math.round(((remainingMin - travelMin) / total) * 100));
    const reachable  = remainingMin > travelMin + 5;

    return (
        <div className="mt-2">
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                {/* Travel segment */}
                <div
                    className="bg-indigo-400 transition-all"
                    style={{ width: `${travelPct}%` }}
                    title={`Travel: ~${travelMin} min`}
                />
                {/* Remaining window */}
                {reachable && (
                    <div
                        className="bg-green-400"
                        style={{ width: `${windowPct}%` }}
                        title={`Available for: ${remainingMin - travelMin} min after arrival`}
                    />
                )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[10px]">
                <span className="flex items-center gap-1 text-indigo-600">
                    <span className="w-2 h-2 rounded-sm inline-block bg-indigo-400" />
                    Drive ~{travelMin} min
                </span>
                {reachable ? (
                    <span className="flex items-center gap-1 text-green-600 font-semibold">
                        <span className="w-2 h-2 rounded-sm inline-block bg-green-400" />
                        {Math.round(remainingMin - travelMin)} min window
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-red-500 font-semibold">
                        <AlertTriangle size={9} />
                        Tight — may miss
                    </span>
                )}
            </div>
        </div>
    );
};

// ── Main card ─────────────────────────────────────────────────────────────

const CurrentlyAvailableCard = ({ hospital, onClick, isBestNow }) => {
    const [expanded, setExpanded] = useState(false);

    const distKm       = hospital.route_distance_meters
        ? (hospital.route_distance_meters / 1000).toFixed(1)
        : '—';
    const travelMin    = parseInt(hospital.travel_time_minutes) || 0;
    const maxRemaining = parseInt(hospital.max_remaining_min)   || 0;
    const netWindow    = parseInt(hospital.net_window_minutes)  || 0;
    const reachable    = hospital.reachable_in_time;
    const doctors      = hospital.available_doctors ?? [];

    return (
        <div
            className={`
                bg-white border rounded-xl shadow-sm transition-all duration-200
                ${isBestNow
                    ? 'border-green-400 ring-2 ring-green-200'
                    : reachable
                    ? 'border-emerald-200 hover:border-emerald-400'
                    : 'border-orange-200 hover:border-orange-300 opacity-80'}
            `}
        >
            {/* ── Header ─────────────────────────────────────────── */}
            <div
                className="p-3 cursor-pointer"
                onClick={() => onClick(hospital.hospital_id)}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-2 flex-wrap">
                            {isBestNow && (
                                <span className="flex items-center gap-1 text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full">
                                    <Trophy size={9} /> Best Now
                                </span>
                            )}
                            {hospital.pareto_score != null && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                                    Score {hospital.pareto_score}
                                </span>
                            )}
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm leading-tight mt-1">
                            {hospital.hospital_name}
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin size={11} /> {hospital.address}
                        </p>
                    </div>

                    {/* Status badge */}
                    <div className={`flex-shrink-0 text-center px-2 py-1 rounded-lg text-xs font-bold ${
                        reachable ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                        <div>{hospital.on_duty_count}</div>
                        <div className="text-[9px] font-normal">on duty</div>
                    </div>
                </div>

                {/* Travel + time bar */}
                <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className="flex items-center gap-1 text-indigo-700 font-semibold">
                        <Car size={12} /> ~{travelMin} min
                    </span>
                    <span className="text-slate-500">{distKm} km</span>
                    {hospital.hospital_rating && (
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                            <Star size={11} fill="currentColor" /> {hospital.hospital_rating}
                        </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-slate-500">
                        <Clock size={11} />
                        {maxRemaining} min left
                    </span>
                </div>

                <TimeBar remainingMin={maxRemaining} travelMin={travelMin} />

                {/* Reachability message */}
                {reachable ? (
                    <p className="mt-2 text-xs text-green-700 font-medium flex items-center gap-1">
                        <Zap size={11} />
                        Arrive in ~{travelMin} min — {netWindow} min with the doctor
                    </p>
                ) : (
                    <p className="mt-2 text-xs text-orange-600 font-medium flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Doctor session ends before you arrive — call ahead
                    </p>
                )}
            </div>

            {/* ── Doctor list toggle ──────────────────────────────── */}
            <div className="border-t px-3 py-1.5">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-indigo-600 font-medium"
                >
                    <span>{doctors.length} doctor{doctors.length !== 1 ? 's' : ''} available now</span>
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {expanded && (
                    <ul className="mt-2 mb-1 space-y-1.5">
                        {doctors.map(doc => (
                            <li key={doc.doctor_id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{doc.name}</p>
                                    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${specColor(doc.specialization)}`}>
                                        {doc.specialization}
                                    </span>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                    <p className="text-slate-500">until {doc.end_time}</p>
                                    <p className={`font-bold ${doc.remaining_minutes > travelMin + 5 ? 'text-green-600' : 'text-orange-500'}`}>
                                        {doc.remaining_minutes} min left
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default CurrentlyAvailableCard;