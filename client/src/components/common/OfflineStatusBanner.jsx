
import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Database, ChevronDown, ChevronUp } from 'lucide-react';

const OfflineStatusBanner = ({ isOnline, isSyncing, cacheStatus, onSync }) => {
    const [expanded, setExpanded] = useState(false);

    // ── Online + syncing ───────────────────────────────────────────────────
    if (isSyncing) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700">
                <RefreshCw size={12} className="animate-spin flex-shrink-0" />
                <span>Caching data for offline use…</span>
            </div>
        );
    }

    // ── Offline ────────────────────────────────────────────────────────────
    if (!isOnline) {
        return (
            <div className="border-b border-orange-200">
                <div
                    className="flex items-center gap-2 px-3 py-2 bg-orange-50 cursor-pointer"
                    onClick={() => setExpanded(v => !v)}
                >
                    <WifiOff size={13} className="text-orange-600 flex-shrink-0" />
                    <span className="text-xs font-semibold text-orange-800 flex-grow">
                        Offline Mode
                    </span>
                    {cacheStatus?.hasCachedData && (
                        <span className="text-[10px] text-orange-600">
                            {cacheStatus.count} hospitals cached
                        </span>
                    )}
                    {expanded ? <ChevronUp size={12} className="text-orange-500" /> : <ChevronDown size={12} className="text-orange-500" />}
                </div>

                {expanded && (
                    <div className="bg-orange-50 px-3 pb-2.5 space-y-1.5 text-xs text-orange-700">
                        {cacheStatus?.hasCachedData ? (
                            <>
                                <p className="flex items-center gap-1">
                                    <Database size={11} />
                                    Data cached {cacheStatus.ageLabel}
                                    {cacheStatus.isStale && (
                                        <span className="text-orange-500 font-semibold ml-1">
                                            ⚠ May be outdated
                                        </span>
                                    )}
                                </p>
                                <p>Routes and hospital info available offline.</p>
                            </>
                        ) : (
                            <p>No cached data. Connect to internet to load hospitals.</p>
                        )}
                        <div className="bg-orange-100 rounded-lg p-2 mt-1">
                            <p className="font-semibold mb-0.5">📩 No internet? Use SMS:</p>
                            <p className="font-mono text-[11px]">CARDIO 22.317 87.300</p>
                            <p className="text-orange-500 text-[10px]">specialty lat lon → nearest hospital reply</p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Online + stale cache warning ──────────────────────────────────────
    if (cacheStatus?.isStale) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                <Wifi size={12} className="flex-shrink-0" />
                <span>Offline data is {cacheStatus.ageLabel} old</span>
                <button
                    onClick={onSync}
                    className="ml-auto flex items-center gap-1 text-indigo-600 font-semibold hover:underline"
                >
                    <RefreshCw size={11} /> Refresh
                </button>
            </div>
        );
    }

    // ── Online + fresh cache ───────────────────────────────────────────────
    if (cacheStatus?.hasCachedData && !cacheStatus.isStale) {
        return (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border-b border-green-100 text-xs text-green-700">
                <Wifi size={12} className="flex-shrink-0" />
                <span>{cacheStatus.count} hospitals cached · works offline</span>
            </div>
        );
    }

    return null; // Online, no cache yet — don't show anything
};

export default OfflineStatusBanner;