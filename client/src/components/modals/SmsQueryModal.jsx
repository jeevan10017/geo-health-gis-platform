// =============================================================================
//  src/components/modals/SmsQueryModal.jsx
//
//  Three-path automation:
//  Path 1 (Online):     Hit API → results shown in-app → SMS sent to 8500003192
//  Path 2 (Offline):    Queue request → auto-fires when internet restores
//  Path 3 (Offline):    "Open SMS App" button → sms: deeplink pre-fills native SMS
//                       → works on ANY phone, zero internet needed
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
    X, MessageSquare, Send, Phone, MapPin,
    CheckCircle, Copy, AlertTriangle, Clock, Wifi, WifiOff,
} from 'lucide-react';

const RECEIVER = '8500003192';

const SPECIALTIES = [
    { code: 'EMERGENCY', label: '🚨 Emergency / ICU'  },
    { code: 'HOSPITAL',  label: '🏥 Any Hospital'      },
    { code: 'CARDIO',    label: '❤️ Cardiology'        },
    { code: 'NEURO',     label: '🧠 Neurology'         },
    { code: 'ORTHO',     label: '🦴 Orthopedics'       },
    { code: 'PEDIA',     label: '👶 Pediatrics'        },
    { code: 'GYNAE',     label: '👩 Gynaecology'       },
    { code: 'ENT',       label: '👂 ENT'               },
    { code: 'EYE',       label: '👁️ Eye'               },
    { code: 'SKIN',      label: '🩺 Dermatology'       },
    { code: 'ONCO',      label: '🎗️ Oncology'          },
    { code: 'LUNG',      label: '🫁 Pulmonology'       },
    { code: 'DENTAL',    label: '🦷 Dental'            },
    { code: 'GENERAL',   label: '🩺 General Medicine'  },
];

const SmsQueryModal = ({ userLocation, isOnline, smsQueue = [], onQueueAdd, onClose }) => {
    const [senderPhone, setSenderPhone] = useState('');
    const [specialty,   setSpecialty]   = useState('HOSPITAL');
    const [sending,     setSending]     = useState(false);
    const [result,      setResult]      = useState(null);
    const [queued,      setQueued]      = useState(false);
    const [error,       setError]       = useState('');
    const [copied,      setCopied]      = useState(false);

    const lat     = userLocation?.[0]?.toFixed(4) ?? '22.3276';
    const lon     = userLocation?.[1]?.toFixed(4) ?? '87.3147';
    const smsText = `${specialty} ${lat} ${lon}`;

    // Load saved phone
    useEffect(() => {
        const saved = localStorage.getItem('geohealth_sender_phone');
        if (saved) setSenderPhone(saved);
    }, []);

    // Save last specialty preference
    useEffect(() => {
        localStorage.setItem('geohealth_last_specialty', specialty);
    }, [specialty]);

    const saveSenderPhone = (phone) => {
        setSenderPhone(phone);
        if (phone.replace(/\D/g,'').length === 10) {
            localStorage.setItem('geohealth_sender_phone', phone);
        }
    };

    // ── Path 1: Online — query + show + send SMS ──────────────────────────────

    const handleOnlineQuery = async () => {
        const digits = senderPhone.replace(/\D/g, '');
        if (digits.length < 10) {
            setError('Enter your 10-digit number to receive the hospital list via SMS.');
            return;
        }
        setError('');
        setSending(true);
        setResult(null);

        try {
            const apiBase = import.meta.env.VITE_API_URL || '/api';

            // Query hospitals + send SMS to receiver
            const res  = await fetch(`${apiBase}/sms/send`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    message:      smsText,
                    phone:        RECEIVER,   // always sends to 8500003192
                    sender_phone: digits,     // logged for context
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Query failed');
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    // ── Path 2: Offline — queue for when internet restores ────────────────────

    const handleQueue = () => {
        const digits = senderPhone.replace(/\D/g, '');
        const item = {
            message:      smsText,
            phone:        RECEIVER,
            sender_phone: digits,
            queued_at:    Date.now(),
            specialty,
        };
        onQueueAdd?.(item);
        setQueued(true);
        // Close after 2s so user sees confirmation
        setTimeout(onClose, 2500);
    };

    // ── Path 3: Native SMS deeplink — zero internet, any phone ───────────────

    const openNativeSms = () => {
        // sms: URI scheme — opens native SMS app pre-filled
        // Works on Android and iOS
        const encoded = encodeURIComponent(smsText);
        window.location.href = `sms:${RECEIVER}?body=${encoded}`;
    };

    const copyText = () => {
        navigator.clipboard?.writeText(smsText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // Fallback for no clipboard API
            const el = document.createElement('textarea');
            el.value = smsText;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[92dvh] flex flex-col">

                {/* Header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 rounded-t-2xl ${!isOnline ? 'bg-orange-50' : 'bg-white'}`}>
                    <div className="flex items-center gap-2">
                        {isOnline
                            ? <Wifi size={16} className="text-green-500" />
                            : <WifiOff size={16} className="text-orange-500 animate-pulse" />
                        }
                        <div>
                            <p className="font-bold text-slate-800 text-sm">
                                {isOnline ? 'SMS Hospital Query' : '📴 Offline — SMS Assist'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                                {isOnline ? 'Results sent to 8500003192' : 'Auto-opens when offline'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
                        <X size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-grow px-4 py-3 space-y-3">

                    {/* Offline status */}
                    {!isOnline && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800">
                            <p className="font-bold mb-1 flex items-center gap-1">
                                <AlertTriangle size={13} /> You're offline
                            </p>
                            <p>Choose how to get hospital info:</p>
                            <div className="mt-2 space-y-1 text-[11px]">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0">1</span>
                                    <span><strong>Queue</strong> — auto-sends when internet restores</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0">2</span>
                                    <span><strong>Open SMS app</strong> — sends right now on any phone</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Queued items */}
                    {smsQueue.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800 flex items-start gap-2">
                            <Clock size={13} className="flex-shrink-0 mt-0.5" />
                            <span><strong>{smsQueue.length}</strong> request{smsQueue.length > 1 ? 's' : ''} queued — will auto-send when online</span>
                        </div>
                    )}

                    {/* Specialty picker */}
                    <div>
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">What do you need?</p>
                        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                            {SPECIALTIES.map(s => (
                                <button
                                    key={s.code}
                                    onClick={() => setSpecialty(s.code)}
                                    className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium text-left transition-all ${
                                        specialty === s.code
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Location */}
                    <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700">
                        <MapPin size={12} className="flex-shrink-0" />
                        <span>Your GPS: {lat}, {lon}</span>
                    </div>

                    {/* SMS preview */}
                    <div className="bg-slate-900 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-slate-400">SMS → {RECEIVER}:</p>
                            <button onClick={copyText} className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300">
                                <Copy size={10} /> {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <p className="font-mono text-green-400 text-sm font-bold">{smsText}</p>
                    </div>

                    {/* Phone number (online only — for context) */}
                    {isOnline && (
                        <div>
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                Your Number (for reference)
                            </p>
                            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
                                <Phone size={14} className="text-slate-400 flex-shrink-0" />
                                <span className="text-sm text-slate-500">+91</span>
                                <input
                                    type="tel"
                                    value={senderPhone}
                                    onChange={e => saveSenderPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                                    placeholder="9876543210"
                                    className="flex-grow text-sm outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                    {/* Result */}
                    {result?.sms_response && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                            <p className="text-xs font-bold text-green-800 mb-1.5 flex items-center gap-1">
                                <CheckCircle size={13} /> Sent to {RECEIVER}:
                            </p>
                            <pre className="text-xs text-green-900 whitespace-pre-wrap font-mono leading-relaxed">
                                {result.sms_response}
                            </pre>
                        </div>
                    )}

                    {/* Queued confirmation */}
                    {queued && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                            <Clock size={24} className="text-indigo-500 mx-auto mb-1" />
                            <p className="text-sm font-bold text-indigo-800">Queued!</p>
                            <p className="text-xs text-indigo-600">Will auto-send when internet restores.</p>
                        </div>
                    )}
                </div>

                {/* Footer buttons */}
                <div className="px-4 pb-4 pt-2 flex-shrink-0 space-y-2">
                    {isOnline ? (
                        /* Online: query + send */
                        <button
                            onClick={handleOnlineQuery}
                            disabled={sending}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                        >
                            {sending
                                ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Querying…</>
                                : <><Send size={15} /> Query &amp; Send SMS</>
                            }
                        </button>
                    ) : (
                        <>
                            {/* Offline Path 2: Queue */}
                            <button
                                onClick={handleQueue}
                                disabled={queued}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                            >
                                <Clock size={15} />
                                {queued ? 'Queued ✓' : 'Queue — Send when Online'}
                            </button>

                            {/* Offline Path 3: Native SMS app */}
                            <button
                                onClick={openNativeSms}
                                className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-orange-600 transition-colors"
                            >
                                <MessageSquare size={15} />
                                Open SMS App (Sends Now)
                            </button>

                            <p className="text-center text-[10px] text-slate-400">
                                "Open SMS App" works on any phone · zero internet needed
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmsQueryModal;