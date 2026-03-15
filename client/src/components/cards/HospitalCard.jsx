
import React from 'react';
import { Car, MapPin, Star, Clock, Bed, Siren } from 'lucide-react';

const costLabel    = { 1: '💚 Govt', 2: '🟡 Mid', 3: '🔴 Pvt' };
const loadColor    = { green: 'bg-green-100 text-green-700', yellow: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700' };
const loadDot      = { green: 'bg-green-500', yellow: 'bg-amber-400', red: 'bg-red-500' };

const HospitalCard = ({
    hospital,
    onClick,
    // Compare mode
    compareMode   = false,
    isSelected    = false,
    onCompareToggle,
    // Load status from /api/hospital-load
    loadStatus,   // 'green' | 'yellow' | 'red' | undefined
}) => {
    const distKm = hospital.route_distance_meters != null
        ? (hospital.route_distance_meters / 1000).toFixed(1)
        : hospital.distance_km?.toFixed(1) ?? '—';

    const handleClick = (e) => {
        if (compareMode) {
            e.stopPropagation();
            onCompareToggle?.(hospital.hospital_id);
        } else {
            onClick(hospital.hospital_id);
        }
    };

    return (
        <div
            onClick={handleClick}
            className={`
                p-4 bg-white border rounded-lg shadow-sm cursor-pointer
                transition-all duration-200
                ${compareMode
                    ? isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-300 shadow-md'
                        : 'hover:border-indigo-300'
                    : 'hover:shadow-md hover:border-indigo-500'}
            `}
        >
            {/* ── Top row ── */}
            <div className="flex items-start gap-2">
                {compareMode && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="mt-1.5 flex-shrink-0 accent-indigo-600 w-4 h-4"
                    />
                )}

                <div className="flex-grow min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-lg text-slate-800 leading-tight">
                            {hospital.hospital_name}
                        </h3>

                        {/* Load status badge */}
                        {loadStatus && (
                            <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${loadColor[loadStatus]}`}>
                                <span className={`inline-block w-2 h-2 rounded-full ${loadDot[loadStatus]}`} />
                                {loadStatus === 'green' ? 'Available' : loadStatus === 'yellow' ? 'Moderate' : 'Crowded'}
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-slate-600 mt-0.5 line-clamp-1 flex items-center gap-1">
                        <MapPin size={13} className="flex-shrink-0" />
                        {hospital.address}
                    </p>
                </div>
            </div>

            {/* ── Distance / time row ── */}
            <div className="flex justify-between items-center mt-3 text-sm">
                <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                    <Car size={16} />
                    <span>~ {hospital.travel_time_minutes} min</span>
                </div>
                <div className="text-slate-500 font-medium">{distKm} km</div>
            </div>

            {/* ── Metrics row (shown when data is present) ── */}
            {(hospital.hospital_rating != null ||
              hospital.avg_wait_time_minutes != null ||
              hospital.available_beds != null ||
              hospital.cost_level != null ||
              hospital.emergency_level != null) && (
                <div className="mt-3 pt-2 border-t flex flex-wrap gap-2">

                    {hospital.hospital_rating != null && (
                        <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                            <Star size={11} fill="currentColor" />
                            {hospital.hospital_rating}
                        </span>
                    )}

                    {hospital.avg_wait_time_minutes != null && (
                        <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                            <Clock size={11} />
                            {hospital.avg_wait_time_minutes} min wait
                        </span>
                    )}

                    {hospital.available_beds != null && (
                        <span className="flex items-center gap-1 text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                            <Bed size={11} />
                            {hospital.available_beds} beds
                        </span>
                    )}

                    {hospital.cost_level != null && (
                        <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                            {costLabel[hospital.cost_level]}
                        </span>
                    )}

                    {hospital.emergency_level != null && (
                        <span className="flex items-center gap-1 text-xs bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                            <Siren size={11} />
                            Emg L{hospital.emergency_level}
                        </span>
                    )}

                    {/* ICU badge — shown in emergency mode */}
                    {hospital.icu_beds != null && (
                        <span className="text-xs bg-purple-50 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
                            ICU: {hospital.icu_beds}
                        </span>
                    )}
                </div>
            )}

            {/* ── Doctor count (initial view) ── */}
            {hospital.doctor_count != null && !hospital.hospital_rating && (
                <p className="text-xs text-slate-500 mt-2">
                    <span className="font-semibold text-green-600">{hospital.doctor_count}</span> doctors available
                </p>
            )}
        </div>
    );
};

export default HospitalCard;