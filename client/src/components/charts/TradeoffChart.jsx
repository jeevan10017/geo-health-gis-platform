
import React, { useEffect, useState } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, ZAxis,
    CartesianGrid, Tooltip, ResponsiveContainer,
    Label, ReferenceLine, Cell,
} from 'recharts';
import { X, Info } from 'lucide-react';
import { getTradeoffData } from '../../services/apiService';

// ─── Rating → colour ─────────────────────────────────────────────────────────

const ratingColor = (r) => {
    if (r == null) return '#94a3b8';   // slate — no data
    if (r >= 4)    return '#16a34a';   // green
    if (r >= 3)    return '#f59e0b';   // amber  (was orange, now matches legend)
    return '#ef4444';                  // red
};

// ─── Parse helper ─────────────────────────────────────────────────────────────

const num = (v) => (v == null ? null : Number(v));

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm max-w-[200px]">
            <p className="font-bold text-slate-800 mb-1 leading-tight">{d.name}</p>
            <p className="text-slate-600">Distance: <strong>{d.x?.toFixed(1)} km</strong></p>
            <p className="text-slate-600">Wait: <strong>{d.y} min</strong></p>
            <p className="text-slate-600">Beds: <strong>{d.available_beds ?? '—'}</strong></p>
            {d.hospital_rating != null && (
                <p className="text-slate-600">Rating: <strong>★ {d.hospital_rating}</strong></p>
            )}
            {d.cost_level != null && (
                <p className="text-slate-600">Cost: <strong>{'$'.repeat(d.cost_level)}</strong></p>
            )}
        </div>
    );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const ChartLegend = () => (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 mt-2">
        {[
            { color: '#16a34a', label: 'Rating ≥ 4.0' },
            { color: '#f59e0b', label: 'Rating 3.0 – 3.9' },
            { color: '#ef4444', label: 'Rating < 3.0' },
            { color: '#94a3b8', label: 'No rating' },
        ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
                <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                />
                {label}
            </span>
        ))}
        <span className="text-slate-400">| Bubble size = available beds</span>
    </div>
);

// ─── How-to-read panel ────────────────────────────────────────────────────────

const HowToRead = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-800 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold mb-1">
            <Info size={13} /> How to use this chart
        </div>
        <p>• <strong>Bottom-left</strong> = close AND fast wait → <span className="text-green-700 font-semibold">sweet spot</span></p>
        <p>• <strong>Top-left</strong> = close but crowded → nearby but slow</p>
        <p>• <strong>Bottom-right</strong> = far but low wait → worth the drive</p>
        <p>• <strong>Bigger bubble</strong> = more available beds</p>
        <p>• <strong>Green dot</strong> = highly rated hospital</p>
    </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

const TradeoffChart = ({ userLocation, onClose }) => {
    const [data,    setData]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        if (!userLocation) return;
        setLoading(true);

        getTradeoffData(userLocation[0], userLocation[1])
            .then(rows => {
                const parsed = rows
                    .map(r => ({
                        ...r,
                        // Recharts ScatterChart uses x / y / z as the axis keys
                        x: num(r.distance_km),
                        y: num(r.avg_wait_time_minutes),
                        z: Math.max(1, num(r.available_beds) ?? 20),   // z must be > 0
                        hospital_rating: num(r.hospital_rating),
                        available_beds:  num(r.available_beds),
                        color: ratingColor(num(r.hospital_rating)),
                    }))
                    .filter(r => r.x != null && r.y != null);

                setData(parsed);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [userLocation]);

    // Average lines
    const avgX = data.length ? data.reduce((s, d) => s + d.x, 0) / data.length : null;
    const avgY = data.length ? data.reduce((s, d) => s + d.y, 0) / data.length : null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Distance vs Wait Time</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Find hospitals that are both close <em>and</em> fast — not just the nearest one.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-4">
                    <HowToRead />

                    {loading && (
                        <div className="h-64 flex items-center justify-center text-slate-500">
                            Loading chart data…
                        </div>
                    )}

                    {error && (
                        <div className="h-64 flex items-center justify-center text-red-500">{error}</div>
                    )}

                    {!loading && !error && data.length === 0 && (
                        <div className="h-64 flex items-center justify-center text-slate-400">
                            No data available.
                        </div>
                    )}

                    {!loading && !error && data.length > 0 && (
                        <>
                            <ResponsiveContainer width="100%" height={340}>
                                <ScatterChart margin={{ top: 10, right: 30, bottom: 40, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />

                                    <XAxis
                                        type="number"
                                        dataKey="x"
                                        name="Distance"
                                        tick={{ fontSize: 12 }}
                                        domain={[0, 'auto']}
                                    >
                                        <Label
                                            value="Distance (km)"
                                            position="insideBottom"
                                            offset={-28}
                                            style={{ fontSize: 12, fill: '#64748b' }}
                                        />
                                    </XAxis>

                                    <YAxis
                                        type="number"
                                        dataKey="y"
                                        name="Wait Time"
                                        tick={{ fontSize: 12 }}
                                        domain={[0, 'auto']}
                                    >
                                        <Label
                                            value="Avg Wait (min)"
                                            angle={-90}
                                            position="insideLeft"
                                            offset={15}
                                            style={{ fontSize: 12, fill: '#64748b' }}
                                        />
                                    </YAxis>

                                    {/* ZAxis controls bubble size — range is pixel area */}
                                    <ZAxis
                                        type="number"
                                        dataKey="z"
                                        range={[200, 1200]}
                                        name="Available Beds"
                                    />

                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={<CustomTooltip />}
                                    />

                                    {/* Average reference lines to show quadrants */}
                                    {avgX != null && (
                                        <ReferenceLine
                                            x={avgX}
                                            stroke="#cbd5e1"
                                            strokeDasharray="5 5"
                                            label={{
                                                value: 'avg dist',
                                                position: 'insideTopRight',
                                                fontSize: 10,
                                                fill: '#94a3b8',
                                            }}
                                        />
                                    )}
                                    {avgY != null && (
                                        <ReferenceLine
                                            y={avgY}
                                            stroke="#cbd5e1"
                                            strokeDasharray="5 5"
                                            label={{
                                                value: 'avg wait',
                                                position: 'insideBottomRight',
                                                fontSize: 10,
                                                fill: '#94a3b8',
                                            }}
                                        />
                                    )}

                                    {/* 
                                        KEY FIX: use Cell for per-point colours instead of 
                                        a custom shape function (which breaks ZAxis radius). 
                                    */}
                                    <Scatter name="Hospitals" data={data} fillOpacity={0.82}>
                                        {data.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.color}
                                                stroke="white"
                                                strokeWidth={1.5}
                                            />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>

                            <ChartLegend />

                            <p className="text-center text-xs text-slate-400 mt-3">
                                The <strong>bottom-left quadrant</strong> (below & left of dashed lines) shows hospitals with{' '}
                                <span className="text-green-600 font-medium">
                                    below-average distance AND wait time
                                </span>{' '}
                                — your sweet spot.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TradeoffChart;