
import React from 'react';
import { X, CheckCircle, XCircle, Trophy } from 'lucide-react';

// ─── Route colour palette (matches MapView) ──────────────────────────────────
export const COMPARE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const costLabel = { 1: 'Low (Govt)', 2: 'Medium', 3: 'High (Pvt)' };
const emgLabel  = { 1: 'Basic',      2: 'Moderate', 3: 'Trauma Centre' };

const Bool = ({ val }) =>
    val ? <CheckCircle size={15} className="text-green-500 mx-auto" />
        : <XCircle    size={15} className="text-slate-300 mx-auto" />;

// ─── Row definition ───────────────────────────────────────────────────────────
//  Each row has:
//    render(h)          → display value (JSX or string)
//    rawValue(h)        → numeric value for "best" detection (null = skip)
//    bestIs             → 'high' | 'low' | null (no winner highlight)

const ROWS = [
    {
        label: 'Distance',
        render:   h => h.distance_km != null ? `${h.distance_km} km` : '—',
        rawValue: h => h.distance_km != null ? parseFloat(h.distance_km) : null,
        bestIs: 'low',
    },
    {
        label: 'Est. Travel Time',
        render:   h => h.travel_time_minutes != null ? `~${h.travel_time_minutes} min` : '—',
        rawValue: h => h.travel_time_minutes != null ? parseFloat(h.travel_time_minutes) : null,
        bestIs: 'low',
    },
    {
        label: 'Avg Wait Time',
        render:   h => h.avg_wait_time_minutes != null ? `${h.avg_wait_time_minutes} min` : '—',
        rawValue: h => h.avg_wait_time_minutes != null ? parseFloat(h.avg_wait_time_minutes) : null,
        bestIs: 'low',
    },
    {
        label: 'Rating',
        render:   h => h.hospital_rating
            ? <span className={`font-bold ${parseFloat(h.hospital_rating) >= 4 ? 'text-green-600' : parseFloat(h.hospital_rating) >= 3 ? 'text-amber-600' : 'text-red-500'}`}>★ {h.hospital_rating}</span>
            : '—',
        rawValue: h => h.hospital_rating != null ? parseFloat(h.hospital_rating) : null,
        bestIs: 'high',
    },
    {
        label: 'Available Beds',
        render:   h => h.available_beds  ?? '—',
        rawValue: h => h.available_beds  != null ? parseFloat(h.available_beds) : null,
        bestIs: 'high',
    },
    {
        label: 'Total Beds',
        render:   h => h.total_beds      ?? '—',
        rawValue: h => null,   // informational only
        bestIs: null,
    },
    {
        label: 'ICU Beds',
        render:   h => h.icu_beds        ?? '—',
        rawValue: h => h.icu_beds != null ? parseFloat(h.icu_beds) : null,
        bestIs: 'high',
    },
    {
        label: 'Ventilators',
        render:   h => h.ventilators     ?? '—',
        rawValue: h => null,
        bestIs: null,
    },
    {
        label: 'Emergency Level',
        render:   h => h.emergency_level ? emgLabel[h.emergency_level] : '—',
        rawValue: h => h.emergency_level != null ? parseFloat(h.emergency_level) : null,
        bestIs: 'high',
    },
    {
        label: 'Ambulance',
        render:   h => <Bool val={h.ambulance_available} />,
        rawValue: h => h.ambulance_available != null ? (h.ambulance_available ? 1 : 0) : null,
        bestIs: 'high',
    },
    {
        label: 'Cost Level',
        render:   h => h.cost_level ? costLabel[h.cost_level] : '—',
        rawValue: h => h.cost_level != null ? parseFloat(h.cost_level) : null,
        bestIs: 'low',
    },
    {
        label: 'CT Scan',           render: h => <Bool val={h.ct_scan} />,           rawValue: h => null, bestIs: null },
    {
        label: 'MRI',               render: h => <Bool val={h.mri} />,               rawValue: h => null, bestIs: null },
    {
        label: 'Pharmacy',          render: h => <Bool val={h.pharmacy} />,          rawValue: h => null, bestIs: null },
    {
        label: 'Blood Bank',        render: h => <Bool val={h.blood_bank} />,        rawValue: h => null, bestIs: null },
    {
        label: 'Wheelchair Access', render: h => <Bool val={h.wheelchair_access} />, rawValue: h => null, bestIs: null },
    {
        label: 'Parking',           render: h => <Bool val={h.parking_available} />, rawValue: h => null, bestIs: null },
];

// ─── Determine winner index for a row ────────────────────────────────────────

const getWinnerIndex = (row, hospitals) => {
    if (!row.bestIs) return null;
    const values = hospitals.map(h => row.rawValue(h));
    if (values.every(v => v == null)) return null;

    const best = row.bestIs === 'high'
        ? Math.max(...values.filter(v => v != null))
        : Math.min(...values.filter(v => v != null));

    const winIdx = values.indexOf(best);
    // Only highlight if it's strictly better than at least one other
    const allSame = values.every(v => v === best);
    return allSame ? null : winIdx;
};

// ─── Overall best hospital (most row wins) ───────────────────────────────────

const getBestHospitalIndex = (hospitals) => {
    const wins = hospitals.map(() => 0);
    ROWS.forEach(row => {
        const w = getWinnerIndex(row, hospitals);
        if (w != null) wins[w]++;
    });
    const max = Math.max(...wins);
    if (max === 0) return null;
    return wins.indexOf(max);
};

// ─── Component ────────────────────────────────────────────────────────────────

const ComparePanel = ({ hospitals, isLoading, onClose }) => {
    const bestIdx = hospitals.length ? getBestHospitalIndex(hospitals) : null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-4">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Hospital Comparison</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Route colours on map match columns · Highlighted column = overall best · 🏆 = row winner
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
                        <X size={22} />
                    </button>
                </div>

                {isLoading ? (
                    <div className="p-10 text-center text-slate-500">Loading comparison data…</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    {/* Metric label column */}
                                    <th className="text-left p-3 font-semibold text-slate-500 border-b w-36 sticky left-0 bg-white z-10">
                                        Metric
                                    </th>

                                    {hospitals.map((h, i) => {
                                        const isOverallBest = i === bestIdx;
                                        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
                                        return (
                                            <th
                                                key={h.hospital_id}
                                                className={`p-3 border-b text-center min-w-[160px] ${isOverallBest ? 'bg-indigo-50' : 'bg-slate-50'}`}
                                            >
                                                <div className="flex items-center justify-center gap-2 mb-1">
                                                    <span
                                                        className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    <span className="font-bold text-slate-800 text-left leading-tight">
                                                        {h.name}
                                                    </span>
                                                    {isOverallBest && (
                                                        <Trophy size={14} className="text-yellow-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                                {isOverallBest && (
                                                    <span className="inline-block text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold mb-1">
                                                        Overall Best
                                                    </span>
                                                )}
                                                <span className="text-xs text-slate-400 font-normal block">
                                                    Rank #{i + 1}
                                                </span>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>

                            <tbody>
                                {ROWS.map(({ label, render, bestIs }, rowIdx) => {
                                    const winnerIdx = bestIs
                                        ? getWinnerIndex({ render, rawValue: ROWS[rowIdx].rawValue, bestIs }, hospitals)
                                        : null;

                                    return (
                                        <tr key={label} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                            <td className="p-3 font-medium text-slate-600 border-b sticky left-0 bg-inherit text-xs">
                                                {label}
                                            </td>
                                            {hospitals.map((h, colIdx) => {
                                                const isOverallBest = colIdx === bestIdx;
                                                const isRowWinner   = colIdx === winnerIdx;
                                                return (
                                                    <td
                                                        key={h.hospital_id}
                                                        className={`
                                                            p-3 text-center border-b relative
                                                            ${isOverallBest ? 'bg-indigo-50/60' : ''}
                                                            ${isRowWinner ? 'font-bold' : 'text-slate-700'}
                                                        `}
                                                    >
                                                        {render(h)}
                                                        {isRowWinner && (
                                                            <span className="absolute top-1 right-1 text-[9px] text-green-600">🏆</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ComparePanel;