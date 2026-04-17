
//  Web Speech API requires HTTPS + Chrome/Edge on Android.
//  "network" error = browser can't reach Google Speech servers
//  (HTTP page, old Android, VPN blocking speech.googleapis.com)
//
//  Fallback: text input with same NLP pipeline
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, X, AlertTriangle, Send, ChevronDown } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const QUICK_COMMANDS = [
    { label: '🚨 Emergency',    text: 'emergency nearest hospital' },
    { label: '❤️ Heart Attack', text: 'heart attack hospital'      },
    { label: '🦴 Accident',     text: 'accident fracture hospital'  },
    { label: '🧠 Stroke',       text: 'stroke neurology doctor'     },
    { label: '👶 Pediatrics',   text: 'child doctor nearest'        },
    { label: '👩 Pregnancy',    text: 'pregnancy gynaecology'       },
];

// Detect if speech will likely work
const speechLikelyWorks = () => {
    const hasAPI     = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const isSecure   = location.protocol === 'https:' || location.hostname === 'localhost';
    const isChrome   = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent)
                    || /SamsungBrowser/.test(navigator.userAgent)
                    || 'webkitSpeechRecognition' in window;
    return hasAPI && isSecure && isChrome;
};

const VoiceQueryButton = ({ userLocation, onHospitalSelect }) => {
    const [showPanel,   setShowPanel]   = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [transcript,  setTranscript]  = useState('');
    const [textInput,   setTextInput]   = useState('');
    const [response,    setResponse]    = useState(null);
    const [isSpeaking,  setIsSpeaking]  = useState(false);
    const [error,       setError]       = useState('');
    const [useText,     setUseText]     = useState(!speechLikelyWorks());
    const [promptIdx,   setPromptIdx]   = useState(0);
    const recognitionRef = useRef(null);
    const inputRef       = useRef(null);

    useEffect(() => {
        const t = setInterval(() => setPromptIdx(i => (i + 1) % QUICK_COMMANDS.length), 3000);
        return () => clearInterval(t);
    }, []);

    const speak = (text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utt  = new SpeechSynthesisUtterance(text);
        utt.lang   = 'en-IN';
        utt.rate   = 0.92;
        utt.onstart = () => setIsSpeaking(true);
        utt.onend   = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utt);
    };

    const processVoice = async (text) => {
        if (!text?.trim()) return;
        setError('');
        try {
            const res  = await fetch(`${API}/analytics/voice-query`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    transcript: text,
                    lat:        userLocation?.[0],
                    lon:        userLocation?.[1],
                }),
            });
            const data = await res.json();
            setResponse(data);
            if (data.response_text) setTimeout(() => speak(data.response_text), 300);
        } catch {
            setError('Could not query hospitals. Check your internet.');
        }
    };

    const handleTextSubmit = (text) => {
        const q = (text || textInput).trim();
        if (!q) return;
        setTranscript(q);
        setTextInput('');
        processVoice(q);
    };

    const startListening = () => {
        // If speech not available or previously failed, use text
        if (useText) { setShowPanel(true); return; }

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setUseText(true); setShowPanel(true); return; }

        setShowPanel(true);
        setTranscript('');
        setResponse(null);
        setError('');

        const recognition = new SR();
        recognitionRef.current = recognition;
        recognition.lang           = 'en-IN';
        recognition.continuous     = false;
        recognition.interimResults = true;

        recognition.onstart  = () => setIsListening(true);
        recognition.onend    = () => setIsListening(false);

        recognition.onresult = (event) => {
            const text = Array.from(event.results).map(r => r[0].transcript).join('');
            setTranscript(text);
            if (event.results[event.results.length - 1].isFinal) processVoice(text);
        };

        recognition.onerror = (e) => {
            setIsListening(false);
            if (e.error === 'not-allowed') {
                setError('Microphone blocked. Allow microphone permission and try again.');
                setUseText(true);
            } else if (e.error === 'network') {
                // Speech API needs HTTPS + Google servers
                setError('');
                setUseText(true);  // silently switch to text mode
            } else if (e.error === 'no-speech') {
                setError('No speech detected. Tap mic again or type below.');
            } else {
                setError(`Mic error: ${e.error}. Using text mode.`);
                setUseText(true);
            }
        };

        try { recognition.start(); }
        catch { setUseText(true); }
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
    };

    return (
        <>
            {/* Floating mic / keyboard button */}
            <button
                onClick={isListening ? stopListening : startListening}
                title={useText ? 'Voice query (text mode)' : 'Speak to find hospitals'}
                className={`
                    fixed bottom-20 right-4 z-40 md:bottom-6
                    w-14 h-14 rounded-full shadow-xl
                    flex items-center justify-center transition-all duration-200
                    ${isListening
                        ? 'bg-red-500 scale-110 animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}
                `}
            >
                {isListening
                    ? <MicOff size={22} className="text-white" />
                    : useText
                    ? <span className="text-white text-xl">🎙️</span>
                    : <Mic size={22} className="text-white" />
                }
                {isListening && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-300 rounded-full animate-ping" />}
            </button>

            {/* Panel */}
            {showPanel && (
                <div className="fixed bottom-36 right-4 z-40 md:bottom-24 w-80 bg-white rounded-2xl shadow-2xl border overflow-hidden">

                    {/* Header */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${isListening ? 'bg-red-50' : 'bg-indigo-50'}`}>
                        <div className="flex items-center gap-2">
                            {useText
                                ? <span className="text-base">🎙️</span>
                                : isListening
                                ? <Mic size={15} className="text-red-600 animate-pulse" />
                                : <Volume2 size={15} className="text-indigo-600" />
                            }
                            <p className="font-bold text-sm text-slate-800">
                                {isListening ? 'Listening…' : isSpeaking ? 'Speaking…' : 'Voice/Text Query'}
                            </p>
                            {useText && !isListening && (
                                <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">TEXT MODE</span>
                            )}
                        </div>
                        <button onClick={() => { stopListening(); setShowPanel(false); window.speechSynthesis?.cancel(); }}
                            className="p-1 rounded-full hover:bg-slate-200"><X size={13} /></button>
                    </div>

                    <div className="p-3 space-y-2.5">

                        {/* Quick command buttons */}
                        {!transcript && !response && (
                            <div>
                                <p className="text-[10px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">Quick select:</p>
                                <div className="grid grid-cols-2 gap-1">
                                    {QUICK_COMMANDS.map(c => (
                                        <button
                                            key={c.text}
                                            onClick={() => { setTranscript(c.text); processVoice(c.text); }}
                                            className="text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-left font-medium transition-all"
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Voice waveform */}
                        {isListening && (
                            <div className="flex items-center justify-center gap-1 py-3">
                                {[...Array(7)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-1 bg-red-500 rounded-full"
                                        style={{
                                            height: `${12 + Math.sin(i * 0.8) * 10}px`,
                                            animation: `bounce ${0.4 + i * 0.07}s ease-in-out infinite alternate`,
                                        }}
                                    />
                                ))}
                                <style>{`@keyframes bounce { from { transform: scaleY(0.4); } to { transform: scaleY(1.2); } }`}</style>
                            </div>
                        )}

                        {/* Transcript */}
                        {transcript && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2 border">
                                <p className="text-[10px] text-slate-400 mb-0.5">Query:</p>
                                <p className="text-sm font-semibold text-slate-800">"{transcript}"</p>
                            </div>
                        )}

                        {/* Text input fallback — always shown */}
                        <div className="flex gap-1.5">
                            <input
                                ref={inputRef}
                                type="text"
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                                placeholder="Type: heart attack, nearest hospital…"
                                className="flex-grow text-xs border rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            <button
                                onClick={() => handleTextSubmit()}
                                disabled={!textInput.trim()}
                                className="px-2.5 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-40 hover:bg-indigo-700"
                            >
                                <Send size={13} />
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        {/* Result */}
                        {response?.hospital && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-green-700 mb-1">
                                    🏥 Best match — {response.hospital.survival_score}% survival score
                                </p>
                                <p className="font-bold text-slate-800 text-sm">{response.hospital.hospital_name}</p>
                                <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                                    <span>{response.hospital.travel_min} min</span>
                                    <span>{response.hospital.dist_km} km</span>
                                    {response.hospital.icu_beds > 0 && <span className="text-green-600 font-semibold">✓ ICU</span>}
                                </div>
                                <div className="flex gap-1.5 mt-2">
                                    <button
                                        onClick={() => { onHospitalSelect?.(response.hospital.hospital_id); setShowPanel(false); }}
                                        className="flex-1 text-xs bg-green-600 text-white rounded-lg py-1.5 font-semibold hover:bg-green-700"
                                    >
                                        Navigate
                                    </button>
                                    <button
                                        onClick={() => speak(response.response_text)}
                                        className="px-2.5 text-xs border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
                                    >
                                        <Volume2 size={13} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Mic button (only if speech likely works) */}
                        {!useText && (
                            <button
                                onClick={isListening ? stopListening : startListening}
                                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl font-semibold text-sm transition-all ${
                                    isListening ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                            >
                                {isListening ? <><MicOff size={15} /> Stop</> : <><Mic size={15} /> Speak</>}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default VoiceQueryButton;