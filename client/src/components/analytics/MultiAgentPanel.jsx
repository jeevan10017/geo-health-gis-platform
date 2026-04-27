
import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { X, Plus, Trash2, Users, BarChart2, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const SEV_COLOR = { 1:'#16a34a', 2:'#65a30d', 3:'#f59e0b', 4:'#f97316', 5:'#dc2626' };
const SEV_LABEL = { 1:'Minor', 2:'Mild', 3:'Moderate', 4:'Serious', 5:'Critical' };
const EMERGENCY_OPTS = ['general','heart_attack','accident','stroke','pregnancy'];
const LINE_COLORS = ['#6366f1','#f59e0b','#16a34a','#dc2626','#8b5cf6','#06b6d4','#f97316'];

const SCENARIOS = {
    'Demo 3 patients': [
        { id:'P1', lat:22.3276, lon:87.3147, severity:4, emergency_type:'heart_attack' },
        { id:'P2', lat:22.4246, lon:87.3224, severity:3, emergency_type:'accident'    },
        { id:'P3', lat:22.6570, lon:87.7379, severity:5, emergency_type:'stroke'      },
    ],
    'Mass casualty 5': [
        { id:'P1', lat:22.32, lon:87.31, severity:5, emergency_type:'accident'     },
        { id:'P2', lat:22.35, lon:87.34, severity:4, emergency_type:'accident'     },
        { id:'P3', lat:22.31, lon:87.29, severity:3, emergency_type:'general'      },
        { id:'P4', lat:22.65, lon:87.73, severity:4, emergency_type:'heart_attack' },
        { id:'P5', lat:22.22, lon:87.13, severity:2, emergency_type:'general'      },
    ],
    'Rural spread 4': [
        { id:'P1', lat:22.12, lon:87.22, severity:4, emergency_type:'pregnancy' },
        { id:'P2', lat:21.95, lon:87.01, severity:3, emergency_type:'general'   },
        { id:'P3', lat:22.73, lon:87.76, severity:5, emergency_type:'stroke'    },
        { id:'P4', lat:22.55, lon:87.45, severity:3, emergency_type:'accident'  },
    ],
};

const patIcon = (sev) => new L.DivIcon({
    html:`<div style="background:${SEV_COLOR[sev]};color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">P</div>`,
    className:'', iconSize:[26,26], iconAnchor:[13,13],
});
const hospIcon = new L.DivIcon({
    html:`<div style="background:#4f46e5;color:white;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">🏥</div>`,
    className:'', iconSize:[26,26], iconAnchor:[13,13],
});

const MultiAgentPanel = ({ userLocation, onClose }) => {
    const [patients,  setPatients]  = useState(SCENARIOS['Demo 3 patients']);
    const [result,    setResult]    = useState(null);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const [tab,       setTab]       = useState('setup');
    const [scenario,  setScenario]  = useState('Demo 3 patients');

    const loadScenario = (name) => { setScenario(name); setPatients(SCENARIOS[name]); setResult(null); };

    const addPatient = () => setPatients(prev => [...prev, {
        id:`P${prev.length+1}`, lat: userLocation?.[0] ?? 22.33, lon: userLocation?.[1] ?? 87.31,
        severity:3, emergency_type:'general',
    }]);

    const removePatient = (idx) => setPatients(prev => prev.filter((_,i) => i !== idx));
    const updatePatient = (idx, k, v) => setPatients(prev => prev.map((p,i) => i===idx ? {...p,[k]:v} : p));

    const run = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const res  = await fetch(`${API}/analytics/multi-agent-assign`,{
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ patients }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data); setTab('result');
        } catch(e) { setError(e.message); }
        finally { setLoading(false); }
    }, [patients]);

    const m = result?.system_metrics;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col">

            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-purple-50 rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <Users size={20} className="text-purple-600"/>
                    <div>
                        <p className="font-black text-purple-900">Multi-Agent Coordination</p>
                        <p className="text-xs text-purple-600">Hungarian algorithm · system-wide optimization</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-purple-100"><X size={18}/></button>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 flex border-b">
                {['setup','result','map'].map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-1 py-2 text-xs font-bold capitalize transition-all ${tab===t ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {t==='setup'?'⚙️ Setup':t==='result'?'📊 Results':'🗺️ Map'}
                    </button>
                ))}
            </div>

            {/* ── SETUP ─── */}
            {tab==='setup' && (
            <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {/* Scenarios */}
                <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">Load scenario:</p>
                    <div className="flex gap-1.5 flex-wrap">
                        {Object.keys(SCENARIOS).map(s => (
                            <button key={s} onClick={() => loadScenario(s)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${scenario===s ? 'bg-purple-600 text-white border-purple-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-purple-300'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Patients */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-600">Patients ({patients.length})</p>
                        <button onClick={addPatient} className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:text-indigo-800">
                            <Plus size={12}/> Add
                        </button>
                    </div>
                    {patients.map((p,idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2.5 border">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                                style={{background:SEV_COLOR[p.severity]}}>
                                {p.id}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 flex-grow text-xs">
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-400 flex-shrink-0">Sev:</span>
                                    <select value={p.severity} onChange={e => updatePatient(idx,'severity',parseInt(e.target.value))}
                                        className="border rounded px-1 py-0.5 text-xs flex-grow" style={{borderColor:SEV_COLOR[p.severity],color:SEV_COLOR[p.severity]}}>
                                        {[1,2,3,4,5].map(s=><option key={s} value={s}>{s}-{SEV_LABEL[s]}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-400 flex-shrink-0">Type:</span>
                                    <select value={p.emergency_type} onChange={e => updatePatient(idx,'emergency_type',e.target.value)}
                                        className="border rounded px-1 py-0.5 text-xs flex-grow">
                                        {EMERGENCY_OPTS.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="text-[9px] text-slate-400 flex-shrink-0">
                                {parseFloat(p.lat).toFixed(3)},{parseFloat(p.lon).toFixed(3)}
                            </div>
                            <button onClick={() => removePatient(idx)} className="p-1 hover:text-red-500 text-slate-400">
                                <Trash2 size={12}/>
                            </button>
                        </div>
                    ))}
                </div>

                {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
            </div>
            )}

            {/* ── RESULT ─── */}
            {tab==='result' && result && (
            <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2">
                    {[
                        {label:'Avg ETA',      val:`${m.avg_eta_min} min`,          color:'text-indigo-700'},
                        {label:'Load Balance', val:`${m.load_balance_score}%`,       color: m.load_balance_score>70?'text-green-700':'text-amber-700'},
                        {label:'Patients',     val:`${m.n_patients} assigned`,       color:'text-purple-700'},
                    ].map(({label,val,color})=>(
                        <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center border">
                            <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
                            <div className={`font-black text-sm ${color}`}>{val}</div>
                        </div>
                    ))}
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 text-xs text-purple-800 flex items-start gap-1.5">
                    <BarChart2 size={12} className="flex-shrink-0 mt-0.5 text-purple-600"/>
                    <span><strong>vs Greedy: </strong>{m.improvement_over_greedy}</span>
                </div>

                {/* Assignments */}
                {result.assignments.map((a,i) => (
                    <div key={a.patient_id} className="bg-white rounded-xl border p-3">
                        <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{background:SEV_COLOR[a.severity]}}>
                                {a.patient_id}
                            </div>
                            <div className="flex-grow min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-700">{a.emergency_type.replace('_',' ')}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold"
                                        style={{background:`${SEV_COLOR[a.severity]}22`,color:SEV_COLOR[a.severity],borderColor:SEV_COLOR[a.severity]}}>
                                        Sev {a.severity}
                                    </span>
                                    {!a.greedy_would_choose && (
                                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full border border-green-200 font-bold">✓ Better than greedy</span>
                                    )}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-600">
                                    → <span className="font-bold text-indigo-700">{a.assigned_hospital?.hospital_name}</span>
                                    <span className="ml-1 text-slate-400">{a.assigned_hospital?.dist_km}km · {a.eta_min}min · wait {a.assigned_hospital?.wait_min}min</span>
                                </p>
                                {a.assigned_ambulance && <p className="text-[10px] text-purple-600 mt-0.5">🚑 {a.assigned_ambulance.id}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className="text-xs font-black">{a.total_time_min}min</div>
                                <div className="text-[10px] text-slate-400">total</div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Hospital load */}
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1.5">Hospital Load</p>
                    <div className="space-y-1">
                        {result.hospital_load.map(h=>(
                            <div key={h.hospital_id} className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 flex-grow truncate">{h.hospital_name}</span>
                                <div className="flex gap-0.5">
                                    {Array.from({length:h.patients_assigned}).map((_,i)=>(
                                        <div key={i} className="w-4 h-4 bg-purple-500 rounded-sm"/>
                                    ))}
                                </div>
                                <span className="text-slate-500 w-10 text-right">{h.patients_assigned}pt</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            )}

            {/* ── MAP ─── */}
            {tab==='map' && (
            <div className="flex-grow relative min-h-[300px]">
                <MapContainer center={userLocation??[22.4,87.3]} zoom={9} style={{height:'100%',width:'100%'}}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.7}/>
                    {patients.map((p,i)=>(
                        <Marker key={p.id??i} position={[parseFloat(p.lat),parseFloat(p.lon)]} icon={patIcon(p.severity)}>
                            <Tooltip>{p.id} · Sev {p.severity} · {p.emergency_type.replace('_',' ')}</Tooltip>
                        </Marker>
                    ))}
                    {result?.assignments?.map((a,i)=>{
                        if (!a.assigned_hospital) return null;
                        const h = a.assigned_hospital;
                        return (
                            <React.Fragment key={a.patient_id}>
                                <Polyline
                                    positions={[[parseFloat(a.patient_lat),parseFloat(a.patient_lon)],[parseFloat(h.lat),parseFloat(h.lon)]]}
                                    pathOptions={{color:LINE_COLORS[i%LINE_COLORS.length],weight:2.5,dashArray:'6 3',opacity:0.85}}
                                />
                                <Marker position={[parseFloat(h.lat),parseFloat(h.lon)]} icon={hospIcon}>
                                    <Tooltip permanent direction="top">
                                        <div className="text-xs font-bold">{h.hospital_name}</div>
                                        <div className="text-[10px] text-slate-500">{a.patient_id}→{h.dist_km}km·{a.eta_min}min</div>
                                    </Tooltip>
                                </Marker>
                            </React.Fragment>
                        );
                    })}
                </MapContainer>
            </div>
            )}

            {/* Footer */}
            <div className="flex-shrink-0 p-3 border-t flex gap-2">
                {tab==='result' && result && (
                    <button onClick={() => setTab('map')} className="flex-1 py-2 text-sm font-bold text-purple-600 border border-purple-300 rounded-xl hover:bg-purple-50">
                        🗺️ View Map
                    </button>
                )}
                <button onClick={run} disabled={loading||patients.length===0}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-purple-700">
                    {loading
                        ? <><RefreshCw size={14} className="animate-spin"/> Optimizing…</>
                        : <><Users size={14}/> Run Assignment</>
                    }
                </button>
            </div>
        </div>
        </div>
    );
};

export default MultiAgentPanel;