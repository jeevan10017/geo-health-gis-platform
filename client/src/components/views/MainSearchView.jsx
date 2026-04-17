
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { Siren, GitCompare, ScatterChart, X, CheckSquare, SlidersHorizontal, MessageSquare } from 'lucide-react';

import SearchBar             from '../common/SearchBar';
import HospitalCard          from '../cards/HospitalCard';
import CurrentlyAvailableCard from '../cards/CurrentlyAvailableCard';
import SpecialtyResultCard   from '../cards/SpecialtyResultCard';
import ComparePanel          from '../panels/ComparePanel';
import TradeoffChart         from '../charts/TradeoffChart';
import ParetoRecommendation  from '../common/ParetoRecommendation';
import PreferencesModal      from '../modals/PreferencesModal';
import OfflineStatusBanner   from '../common/OfflineStatusBanner';
import SmsQueryModal         from '../modals/SmsQueryModal';
import Loader                from '../common/Loader';

import { compareHospitals }                    from '../../services/apiService';
import { annotateWithPareto, DEFAULT_WEIGHTS } from '../../utils/pareto';
import { Navigation, Clock, Star, Banknote, LayoutGrid } from 'lucide-react';

// ─── Decision mode pill data (inline — no separate component needed) ──────────
const MODES = [
    { id: null,       label: 'Nearest',    Icon: LayoutGrid,  title: 'Sort by road distance'      },
    { id: 'fastest',  label: 'Fastest',    Icon: Navigation,  title: 'Sort by travel time'         },
    { id: 'wait',     label: 'Least Wait', Icon: Clock,       title: 'Sort by avg wait time'       },
    { id: 'rating',   label: 'Top Rated',  Icon: Star,        title: 'Sort by hospital rating'     },
    { id: 'cheapest', label: 'Cheapest',   Icon: Banknote,    title: 'Sort by cost (lowest first)' },
];

// ─── react-select theme ──────────────────────────────────────────────────────

const selectTheme = (t) => ({
    ...t,
    colors: {
        ...t.colors,
        primary: '#4f46e5', primary75: '#6366f1',
        primary50: '#818cf8', primary25: '#eef2ff',
    },
});

const radiusOptions = [
    { value: '',   label: 'All Hospitals'  },
    { value: '5',  label: 'Within 5 km'   },
    { value: '10', label: 'Within 10 km'  },
    { value: '25', label: 'Within 25 km'  },
    { value: '40', label: 'Within 40 km'  },
];

// ─── Component ────────────────────────────────────────────────────────────────

const MainSearchView = ({
    userLocation,
    onHospitalSelect,
    onDoctorSelect,
    onSetSearch,
    radius,
    setRadius,
    searchResults,
    isLoading,
    error,
    decisionMode,
    onDecisionMode,
    isEmergencyMode,
    onEmergencyToggle,
    isCurrentlyAvailable,
    onCurrentlyAvailableToggle,
    onShowBlackspots,
    onShowSurvival,
    onShowSms,
    loadStatusMap,
    onCompareHospitalsChange,
    onAnnotatedChange,          // lift annotated results to App → MapView
}) => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q');
    const type  = searchParams.get('type');

    // ── Pareto state ──────────────────────────────────────────────────────────
    const [weights,          setWeights]          = useState(DEFAULT_WEIGHTS);
    const [showPreferences,  setShowPreferences]  = useState(false);
    const [prefApplied,      setPrefApplied]      = useState(false);

    const [showSmsModal,    setShowSmsModal]    = useState(false);
    const [isOnline,        setIsOnline]        = useState(navigator.onLine);

    useEffect(() => {
        const up   = () => setIsOnline(true);
        const down = () => setIsOnline(false);
        window.addEventListener('online',  up);
        window.addEventListener('offline', down);
        return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }, []);
    const [compareMode,      setCompareMode]      = useState(false);
    const [selectedIds,      setSelectedIds]      = useState(new Set());
    const [compareData,      setCompareData]      = useState([]);
    const [compareLoading,   setCompareLoading]   = useState(false);
    const [showCompare,      setShowCompare]      = useState(false);

    // ── Other UI state ────────────────────────────────────────────────────────
    const [showTradeoff,     setShowTradeoff]     = useState(false);

    // ── Pareto computation — only for default/specialty search ───────────────
    // Decision-mode and emergency have their own explicit sort; don't overlay Pareto there.
    const shouldAnnotate = !isEmergencyMode && !decisionMode && !isCurrentlyAvailable;

    const annotated = useMemo(() => {
        if (!searchResults?.length) return searchResults;
        if (!shouldAnnotate) {
            // Strip any stale pareto flags, just pass through as-is
            return searchResults.map(h => ({
                ...h, isPareto: false, isTopChoice: false, paretoScore: null
            }));
        }
        const scored = annotateWithPareto(searchResults, weights);
        // Add 1-based paretoRank (rank within Pareto front by score, null for non-Pareto)
        const frontSorted = scored
            .filter(h => h.isPareto)
            .sort((a, b) => b.paretoScore - a.paretoScore);
        const rankMap = new Map(frontSorted.map((h, i) => [h.hospital_id, i + 1]));
        return scored.map(h => ({ ...h, paretoRank: rankMap.get(h.hospital_id) ?? null }));
    }, [searchResults, weights, shouldAnnotate]);

    const topChoice   = useMemo(() =>
        shouldAnnotate ? (annotated.find(h => h.isTopChoice) ?? null) : null,
    [annotated, shouldAnnotate]);

    const paretoFront = useMemo(() =>
        shouldAnnotate ? annotated.filter(h => h.isPareto) : [],
    [annotated, shouldAnnotate]);

    // Pass annotated results up to App so MapView can use Pareto icons
    useEffect(() => {
        onAnnotatedChange?.(annotated);
    }, [annotated]); // eslint-disable-line

    // ── Reset compare when results change ─────────────────────────────────────
    useEffect(() => { setSelectedIds(new Set()); }, [searchResults]);

    useEffect(() => {
        if (isEmergencyMode || type === 'specialty') {
            setCompareMode(false);
            setSelectedIds(new Set());
        }
    }, [isEmergencyMode, type]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const searchTitle = isCurrentlyAvailable
        ? '🟢 Doctors Available Now'
        : isEmergencyMode
        ? '🚨 Emergency Hospitals'
        : decisionMode
        ? { fastest: 'Fastest to Reach', wait: 'Least Wait Time', rating: 'Top Rated', cheapest: 'Most Affordable' }[decisionMode]
        : type === 'specialty' && query
        ? `Results for "${query}"`
        : 'Nearby Hospitals';

    const showPareto = shouldAnnotate && !isLoading && annotated.length >= 2 &&
                       topChoice && !compareMode;

    // Notify App when compare panel opens/closes so MapView can switch to compare-only mode
    useEffect(() => {
        onCompareHospitalsChange?.(showCompare ? compareData : []);
    }, [showCompare, compareData]); // eslint-disable-line

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleSearch = (suggestion) => {
        if (suggestion.type === 'specialty') {
            onSetSearch({ q: suggestion.primary_text, type: suggestion.type });
        } else if (suggestion.type === 'hospital') {
            onHospitalSelect(suggestion.id);
        } else if (suggestion.type === 'doctor') {
            onDoctorSelect(suggestion.id);
        }
    };

    const handleApplyPreferences = (w) => {
        setWeights(w);
        setPrefApplied(true);
        setShowPreferences(false);
    };

    const handleSkipPreferences = () => {
        setWeights(DEFAULT_WEIGHTS);
        setPrefApplied(false);
        setShowPreferences(false);
    };

    const handleResetPreferences = () => {
        setWeights(DEFAULT_WEIGHTS);
        setPrefApplied(false);
    };

    const toggleCompareItem = useCallback((id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); }
            else if (next.size < 4) { next.add(id); }
            return next;
        });
    }, []);

    const handleOpenCompare = async () => {
        if (selectedIds.size < 2) return;
        setCompareLoading(true);
        setShowCompare(true);
        try {
            const data = await compareHospitals(
                [...selectedIds],
                userLocation?.[0],
                userLocation?.[1]
            );
            setCompareData(data);
        } catch (err) {
            console.error('Compare failed:', err);
        } finally {
            setCompareLoading(false);
        }
    };

    const handleCloseCompare = () => {
        setShowCompare(false);
        setCompareData([]);
    };

    const handleToggleCompareMode = () => {
        setCompareMode(v => !v);
        setSelectedIds(new Set());
    };

    const handleDecisionMode = (mode) => {
        if (mode !== null) onSetSearch({});
        onDecisionMode(mode);
    };

    const handleEmergencyToggle = () => {
        if (!isEmergencyMode) onSetSearch({});
        onEmergencyToggle();
    };

    // ── Render results ────────────────────────────────────────────────────────

    const renderResults = () => {
        if (isLoading) return <Loader />;
        if (error)     return <p className="text-center text-red-600 p-4">{error}</p>;
        if (annotated.length === 0) {
            if (isCurrentlyAvailable) {
                return (
                    <div className="text-center py-8 px-4">
                        <div className="text-4xl mb-3">🏥</div>
                        <p className="text-slate-700 font-semibold">No doctors on duty right now</p>
                        <p className="text-slate-500 text-sm mt-1">
                            Try visiting during clinic hours or use the date filter in a hospital's detail view.
                        </p>
                    </div>
                );
            }
            return <p className="text-center text-slate-500 p-4">No results found.</p>;
        }

        // ── Currently Available mode: use dedicated card ──────────────────────
        if (isCurrentlyAvailable) {
            return annotated.map(item => (
                <div key={item.hospital_id} className="relative">
                    {item.is_best_now && (
                        <span className="absolute -top-1.5 -right-1 z-10 flex items-center gap-0.5 bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow animate-pulse">
                            ★ Best Now
                        </span>
                    )}
                    <CurrentlyAvailableCard
                        hospital={item}
                        onClick={onHospitalSelect}
                        isBestNow={!!item.is_best_now}
                    />
                </div>
            ));
        }

        return annotated.map((item) => {
            // Pareto rank badge
            const badge = item.isTopChoice
                ? (
                    <span className="absolute -top-1.5 -right-1 z-10 flex items-center gap-0.5 bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
                        ★ #1 Best
                    </span>
                )
                : item.isPareto && item.paretoRank
                ? (
                    <span className="absolute -top-1.5 -right-1 z-10 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-300">
                        ◆ #{item.paretoRank}
                    </span>
                )
                : null;

            const card = (type === 'specialty' && !isEmergencyMode && !decisionMode)
                ? <SpecialtyResultCard hospital={item} onClick={onHospitalSelect} />
                : (
                    <HospitalCard
                        hospital={item}
                        onClick={onHospitalSelect}
                        compareMode={compareMode}
                        isSelected={selectedIds.has(item.hospital_id)}
                        onCompareToggle={toggleCompareItem}
                        loadStatus={loadStatusMap?.get(item.hospital_id)?.load_status}
                    />
                );

            return (
                <div key={item.hospital_id} className="relative">
                    {badge}
                    {card}
                </div>
            );
        });
    };

    // ── JSX ───────────────────────────────────────────────────────────────────

    return (
        <div className="p-4 h-full flex flex-col gap-3 overflow-hidden">

            {/* ── Offline status banner ───────────────────────────── */}
            {!isOnline && (
                <OfflineStatusBanner
                    isOnline={isOnline}
                    isSyncing={false}
                    cacheStatus={null}
                    onSync={() => {}}
                />
            )}

            {/* ── Brand + search ─────────────────────── */}
            <div className="flex-shrink-0 space-y-3">
                <div className="flex items-center gap-3">
                    <img
                        src="/geoHealthLogo.png"
                        alt="GeoHealth logo"
                        className="h-8 w-8 sm:h-10 sm:w-10 object-contain"
                        loading="lazy"
                    />
                    <h1 className="text-2xl font-bold text-slate-800">Find a Doctor</h1>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="w-full sm:w-[70%]">
                        <SearchBar onSearch={handleSearch} userLocation={userLocation} />
                    </div>
                    <div className="w-full sm:w-[30%] relative z-20 sm:pl-2">
                        <Select
                            options={radiusOptions}
                            defaultValue={radiusOptions.find(o => o.value === radius)}
                            onChange={opt => setRadius(opt.value)}
                            theme={selectTheme}
                            classNamePrefix="geo"
                            placeholder="Filter distance..."
                            styles={{
                                control: (b) => ({ ...b, borderRadius: '0.5rem', paddingLeft: '0.25rem', boxShadow: 'none', minHeight: '40px', fontSize: window.innerWidth < 640 ? '12px' : '14px' }),
                                option:      (b) => ({ ...b, fontSize: window.innerWidth < 640 ? '12px' : '14px', padding: '8px 10px' }),
                                singleValue: (b) => ({ ...b, fontSize: window.innerWidth < 640 ? '12px' : '14px' }),
                            }}
                        />
                    </div>
                </div>

                {/* ── Row 1: Decision mode pills ────────────────────────── */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
                    {MODES.map(({ id, label, Icon, title }) => {
                        const isActive = !isEmergencyMode && decisionMode === id;
                        return (
                            <button
                                key={String(id)}
                                title={title}
                                onClick={() => handleDecisionMode(id)}
                                className={`
                                    flex items-center gap-1 flex-shrink-0
                                    px-2.5 py-1.5 rounded-full text-xs font-semibold border
                                    transition-all duration-150
                                    ${isActive
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'}
                                `}
                            >
                                <Icon size={12} />{label}
                            </button>
                        );
                    })}
                </div>

                {/* ── Row 2: Action buttons ──────────────────────────────── */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">

                    {/* Currently Available — live green pulse */}
                    <button
                        onClick={onCurrentlyAvailableToggle}
                        title="Hospitals with doctors on duty right now, sorted by best reachable option"
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${isCurrentlyAvailable ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrentlyAvailable ? 'bg-white' : 'bg-green-500 animate-pulse'}`} />
                        Available Now
                    </button>

                    {/* Emergency */}
                    <button
                        onClick={handleEmergencyToggle}
                        title="ICU-capable emergency hospitals"
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${isEmergencyMode ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-red-600 border-red-300 hover:bg-red-50'}`}
                    >
                        <Siren size={12} /> Emergency
                    </button>

                    {/* My Priorities */}
                    <button
                        onClick={() => setShowPreferences(true)}
                        title="Set your hospital priorities for Pareto recommendation"
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${prefApplied ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'}`}
                    >
                        <SlidersHorizontal size={12} /> {prefApplied ? 'Priorities ✓' : 'My Priorities'}
                    </button>

                    {prefApplied && (
                        <button
                            onClick={handleResetPreferences}
                            title="Reset to default priorities"
                            className="flex-shrink-0 text-[10px] text-slate-400 hover:text-red-500 underline px-1"
                        >
                            reset
                        </button>
                    )}

                    {/* Compare */}
                    <button
                        onClick={handleToggleCompareMode}
                        title="Select up to 4 hospitals to compare"
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${compareMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'}`}
                    >
                        <GitCompare size={12} />
                        Compare
                        {compareMode && selectedIds.size > 0 && (
                            <span className="bg-white text-indigo-600 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                                {selectedIds.size}
                            </span>
                        )}
                    </button>

                    {/* Trade-off */}
                    <button
                        onClick={() => setShowTradeoff(true)}
                        title="Distance vs wait time scatter chart"
                        className="flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-all duration-150"
                    >
                        <ScatterChart size={12} /> Trade-off
                    </button>

                    {/* SMS Query */}
                    <button
                        onClick={onShowSms ?? (() => setShowSmsModal(true))}
                        title="Query hospitals via SMS"
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                            !isOnline
                                ? 'bg-orange-500 text-white border-orange-500 shadow-sm animate-pulse'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                        <MessageSquare size={12} />
                        {!isOnline ? 'SMS !' : 'SMS'}
                    </button>

                    {/* Blackspot map */}
                    <button
                        onClick={onShowBlackspots}
                        title="Healthcare blackspot heatmap"
                        className="flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border bg-white text-slate-600 border-slate-300 hover:border-red-400 hover:text-red-600 transition-all duration-150"
                    >
                        🗺️ Blackspots
                    </button>

                    {/* Survival routing */}
                    <button
                        onClick={onShowSurvival}
                        title="Survival-aware emergency routing"
                        className="flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-300 hover:bg-red-100 transition-all duration-150"
                    >
                        ❤️ Survival Route
                    </button>

                </div>

                <h2 className="text-base font-semibold text-slate-700">{searchTitle}</h2>
            </div>

            {/* ── Results list ───────────────────────── */}
            <div className="flex-grow overflow-y-auto pr-1 space-y-3">

                {/* Pareto recommendation — shown above results */}
                {showPareto && (
                    <ParetoRecommendation
                        topChoice={topChoice}
                        paretoFront={paretoFront}
                        onHospitalSelect={onHospitalSelect}
                    />
                )}

                {renderResults()}
            </div>

            {/* ── Compare sticky bar ─────────────────── */}
            {compareMode && selectedIds.size >= 2 && (
                <div className="flex-shrink-0 border-t pt-3 flex items-center justify-between gap-3 bg-white">
                    <p className="text-sm text-slate-600 font-medium">
                        {selectedIds.size} selected <span className="text-xs text-slate-400">(max 4)</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-slate-500 border hover:bg-slate-100"
                        >
                            <X size={13} /> Clear
                        </button>
                        <button
                            onClick={handleOpenCompare}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                            <CheckSquare size={14} /> Compare Now
                        </button>
                    </div>
                </div>
            )}

            {/* ── Modals ─────────────────────────────── */}
            {showPreferences && (
                <PreferencesModal
                    onApply={handleApplyPreferences}
                    onSkip={handleSkipPreferences}
                    onClose={() => setShowPreferences(false)}
                />
            )}

            {showCompare && (
                <ComparePanel
                    hospitals={compareData}
                    isLoading={compareLoading}
                    onClose={handleCloseCompare}
                />
            )}

            {showSmsModal && (
                <SmsQueryModal
                    userLocation={userLocation}
                    onClose={() => setShowSmsModal(false)}
                />
            )}

            {showTradeoff && (
                <TradeoffChart
                    userLocation={userLocation}
                    onClose={() => setShowTradeoff(false)}
                />
            )}
        </div>
    );
};

export default MainSearchView;