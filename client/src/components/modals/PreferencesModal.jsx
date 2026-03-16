import React, { useState } from 'react';
import { X, SlidersHorizontal, SkipForward } from 'lucide-react';
import { DEFAULT_WEIGHTS } from '../../utils/pareto';

// ─── Slider row ───────────────────────────────────────────────────────────────

const SliderRow = ({ label, description, value, onChange, color }) => (
    <div className="space-y-1">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{description}</p>
            </div>

            <span
                className="text-sm font-bold w-8 text-right"
                style={{ color }}
            >
                {value}
            </span>
        </div>

        <input
    type="range"
    min={0}
    max={10}
    value={value}
    onChange={e => onChange(parseInt(e.target.value))}
    className="w-full h-2 rounded-lg appearance-none cursor-pointer border border-slate-300 bg-slate-200"
    style={{ accentColor: color }}
/>
    </div>
);

// ─── Preset profiles ──────────────────────────────────────────────────────────

const PRESETS = [
    {
        id: 'emergency',
        label: 'Emergency',
        desc: 'Fastest + closest above all',
        raw: { distance: 9, waitTime: 9, rating: 2, cost: 1, beds: 4 },
    },
    {
        id: 'quality',
        label: 'Best Quality',
        desc: "Highest rated, don't mind distance",
        raw: { distance: 2, waitTime: 4, rating: 9, cost: 2, beds: 5 },
    },
    {
        id: 'budget',
        label: 'Budget',
        desc: 'Low cost government hospitals',
        raw: { distance: 4, waitTime: 4, rating: 4, cost: 9, beds: 3 },
    },
    {
        id: 'balanced',
        label: 'Balanced',
        desc: 'Equal weight on all factors',
        raw: { distance: 5, waitTime: 5, rating: 5, cost: 5, beds: 5 },
    },
];

// Convert raw slider values (0-10) to normalised weights (sum = 1)
const rawToWeights = (raw) => {
    const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
    return {
        distance: raw.distance / total,
        waitTime: raw.waitTime / total,
        rating: raw.rating / total,
        cost: raw.cost / total,
        beds: raw.beds / total,
    };
};

// ─── Component ────────────────────────────────────────────────────────────────

const PreferencesModal = ({ onApply, onSkip, onClose }) => {
    const [raw, setRaw] = useState({ distance: 6, waitTime: 5, rating: 5, cost: 3, beds: 3 });
    const [activePreset, setActivePreset] = useState(null);

    const set = (key) => (val) => {
        setRaw(prev => ({ ...prev, [key]: val }));
        setActivePreset(null);
    };

    const applyPreset = (preset) => {
        setRaw(preset.raw);
        setActivePreset(preset.id);
    };

    const handleApply = () => {
        onApply(rawToWeights(raw));
    };

    const colors = ['#6366f1','#f59e0b','#16a34a','#0891b2','#7c3aed'];
    const labels = { distance: 'Proximity', waitTime: 'Wait', rating: 'Quality', cost: 'Cost', beds: 'Beds' };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal size={20} className="text-indigo-600" />
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">What matters to you?</h2>
                            <p className="text-xs text-slate-500">
                                We'll highlight the best hospital for your priorities.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-5">

                    {/* Quick presets */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Quick Presets
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => applyPreset(p)}
                                    className={`
                                        text-left px-3 py-2 rounded-lg border text-sm transition-all
                                        ${activePreset === p.id
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 hover:border-indigo-300 text-slate-700'}
                                    `}
                                >
                                    <div className="font-semibold">{p.label}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sliders */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Or adjust manually (drag to set importance)
                        </p>
                        <div className="space-y-4">
                            <SliderRow
                                label="Proximity"
                                description="How close the hospital is"
                                value={raw.distance}
                                onChange={set('distance')}
                                color="#6366f1"
                            />
                            <SliderRow
                                label="Wait Time"
                                description="How quickly you'll be seen"
                                value={raw.waitTime}
                                onChange={set('waitTime')}
                                color="#f59e0b"
                            />
                            <SliderRow
                                label="Quality / Rating"
                                description="Hospital rating and reputation"
                                value={raw.rating}
                                onChange={set('rating')}
                                color="#16a34a"
                            />
                            <SliderRow
                                label="Affordability"
                                description="Lower cost / government hospitals"
                                value={raw.cost}
                                onChange={set('cost')}
                                color="#0891b2"
                            />
                            <SliderRow
                                label="Bed Availability"
                                description="How many beds are free"
                                value={raw.beds}
                                onChange={set('beds')}
                                color="#7c3aed"
                            />
                        </div>
                    </div>

                    {/* Weight preview */}
                    <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Weight breakdown</p>

                        <div className="flex h-3 rounded-full overflow-hidden">
                            {Object.entries(rawToWeights(raw)).map(([key, w], i) => (
                                <div
                                    key={key}
                                    className="flex-none"
                                    style={{
                                        width: `${w * 100}%`,
                                        minWidth: '2px',
                                        backgroundColor: colors[i]
                                    }}
                                    title={`${key}: ${Math.round(w * 100)}%`}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                            {Object.entries(rawToWeights(raw)).map(([key, w], i) => (
                                <span key={key} className="flex items-center gap-1 text-xs text-slate-600">
                                    <span
                                        className="w-2 h-2 rounded-full inline-block"
                                        style={{ backgroundColor: colors[i] }}
                                    />
                                    {labels[key]} {Math.round(w * 100)}%
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onSkip}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 flex-1 justify-center"
                        >
                            <SkipForward size={15} />
                            Skip — use defaults
                        </button>

                        <button
                            onClick={handleApply}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex-1 justify-center"
                        >
                            <SlidersHorizontal size={15} />
                            Apply & Recommend
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PreferencesModal;