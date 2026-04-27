
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, Send, AlertTriangle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

// ─── TTS hook — exported for use in NavigationView too ────────────────────────

export const useTTS = () => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [enabled,    setEnabled]    = useState(
        () => localStorage.getItem('geohealth_tts') !== 'off'
    );

    const speak = useCallback((text, lang = 'en-IN') => {
        if (!enabled || !window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();

        const utt  = new SpeechSynthesisUtterance(text);
        utt.lang   = lang;
        utt.rate   = 0.92;
        utt.pitch  = 1.0;
        utt.volume = 1.0;

        // Pick best available voice for Indian English
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.lang === 'en-IN' || v.lang === 'en-GB' || v.name.includes('Google')
        );
        if (preferred) utt.voice = preferred;

        utt.onstart = () => setIsSpeaking(true);
        utt.onend   = () => setIsSpeaking(false);
        utt.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utt);
    }, [enabled]);

    const stop = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    }, []);

    const toggle = useCallback(() => {
        setEnabled(v => {
            const next = !v;
            localStorage.setItem('geohealth_tts', next ? 'on' : 'off');
            if (!next) window.speechSynthesis?.cancel();
            return next;
        });
    }, []);

    return { speak, stop, isSpeaking, enabled, toggle };
};

// ─── Quick commands ────────────────────────────────────────────────────────────

const QUICK = [
    { label: '🚨 Emergency',    text: 'emergency nearest hospital' },
    { label: '❤️ Heart',        text: 'heart attack hospital'      },
    { label: '🦴 Accident',     text: 'accident fracture hospital'  },
    { label: '🧠 Stroke',       text: 'stroke neurology hospital'   },
    { label: '👶 Child',        text: 'child pediatrics doctor'     },
    { label: '👩 Pregnancy',    text: 'pregnancy gynaecology'       },
];

// ─── Recognition engine ───────────────────────────────────────────────────────

const createRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang           = 'en-IN';
    r.continuous     = false;
    r.interimResults = true;
    r.maxAlternatives = 3;
    return r;
};

// ─── Main component ────────────────────────────────────────────────────────────

const VoiceQueryButton = ({ userLocation, onHospitalSelect }) => {
    const [showPanel,   setShowPanel]   = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [transcript,  setTranscript]  = useState('');
    const [textInput,   setTextInput]   = useState('');
    const [response,    setResponse]    = useState(null);
    const [status,      setStatus]      = useState('');  // user-friendly status
    const [error,       setError]       = useState('');
    const { speak, stop, isSpeaking, enabled, toggle } = useTTS();

    const recRef   = useRef(null);
    const inputRef = useRef(null);

    // Pre-load voices (Chrome async)
    useEffect(() => {
        window.speechSynthesis?.getVoices();
        window.speechSynthesis?.addEventListener('voiceschanged', () => {});
    }, []);

    // ── Query backend ─────────────────────────────────────────────────────────

    const processQuery = useCallback(async (text) => {
        if (!text?.trim()) return;
        setError('');
        setStatus('Searching hospitals…');
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
            setStatus('');
            if (data.response_text) setTimeout(() => speak(data.response_text), 200);
        } catch {
            setError('Could not reach server. Check internet.');
            setStatus('');
        }
    }, [userLocation, speak]);

    // ── Start mic ─────────────────────────────────────────────────────────────

    const startListening = useCallback(async () => {
        setTranscript('');
        setResponse(null);
        setError('');

        // Check microphone permission first
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setError('Microphone permission denied. Use text input below.');
            setShowPanel(true);
            return;
        }

        const recognition = createRecognition();

        if (!recognition) {
            setError('');
            setShowPanel(true);
            return;
        }

        recRef.current = recognition;
        setShowPanel(true);

        let finalTranscript = '';
        let networkRetries  = 0;

        recognition.onstart  = () => { setIsListening(true); setStatus('Listening…'); };
        recognition.onend    = () => {
            setIsListening(false);
            setStatus(finalTranscript ? '' : '');
            if (finalTranscript) processQuery(finalTranscript);
        };

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalTranscript += t;
                else interim += t;
            }
            setTranscript(finalTranscript || interim);
        };

        recognition.onerror = (e) => {
            setIsListening(false);
            if (e.error === 'network' && networkRetries < 2) {
                // Retry up to 2 times — sometimes transient
                networkRetries++;
                setStatus(`Retrying… (${networkRetries}/2)`);
                setTimeout(() => {
                    try { recognition.start(); }
                    catch { setStatus(''); setError('Voice unavailable. Use text below.'); }
                }, 800);
            } else if (e.error === 'network') {
                setStatus('');
                setError('Voice requires internet access to speech servers. Use text input below — it works the same way.');
            } else if (e.error === 'not-allowed') {
                setError('Microphone blocked. Go to browser Settings → Site permissions → Microphone → Allow.');
            } else if (e.error === 'no-speech') {
                setStatus('');
                setError('Nothing heard. Tap mic again and speak clearly.');
            } else if (e.error === 'aborted') {
                setStatus('');
            } else {
                setError(`Voice error: ${e.error}. Use text input below.`);
            }
        };

        try {
            recognition.start();
        } catch (err) {
            setError('Could not start microphone. Use text input below.');
        }
    }, [processQuery]);

    const stopListening = useCallback(() => {
        recRef.current?.stop();
        setIsListening(false);
        setStatus('');
    }, []);

    const handleText = (txt) => {
        const q = (txt ?? textInput).trim();
        if (!q) return;
        setTranscript(q);
        setTextInput('');
        processQuery(q);
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={isListening ? stopListening : startListening}
                title="Voice / text hospital query"
                className={`
                    fixed bottom-20 right-4 z-40 md:bottom-6
                    w-14 h-14 rounded-full shadow-xl flex items-center justify-center
                    transition-all duration-200 select-none
                    ${isListening ? 'bg-red-500 scale-110' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}
                `}
            >
                {isListening
                    ? <MicOff size={22} className="text-white" />
                    : <Mic size={22} className="text-white" />
                }
                {isListening && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-300 rounded-full animate-ping" />}
            </button>

            {showPanel && (
                <div className="fixed bottom-36 right-4 z-40 md:bottom-24 w-80 bg-white rounded-2xl shadow-2xl border overflow-hidden">

                    {/* Header */}
                    <div className={`px-3 py-2.5 flex items-center justify-between ${isListening ? 'bg-red-50' : 'bg-indigo-50'}`}>
                        <div className="flex items-center gap-2">
                            <Mic size={14} className={isListening ? 'text-red-600 animate-pulse' : 'text-indigo-600'} />
                            <p className="font-bold text-sm text-slate-800">
                                {status || (isListening ? 'Listening…' : isSpeaking ? 'Speaking…' : 'Find Hospital')}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={toggle} title={enabled ? 'Mute voice' : 'Unmute voice'}
                                className="p-1 rounded-full hover:bg-slate-100">
                                {enabled ? <Volume2 size={14} className="text-indigo-500" /> : <VolumeX size={14} className="text-slate-400" />}
                            </button>
                            <button onClick={() => { stopListening(); stop(); setShowPanel(false); }}
                                className="p-1 rounded-full hover:bg-slate-100"><X size={14} /></button>
                        </div>
                    </div>

                    <div className="p-3 space-y-2.5">

                        {/* Quick tap */}
                        {!transcript && !response && (
                            <div className="grid grid-cols-2 gap-1">
                                {QUICK.map(c => (
                                    <button key={c.text} onClick={() => { setTranscript(c.text); processQuery(c.text); }}
                                        className="text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-left font-medium transition-all">
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Waveform when listening */}
                        {isListening && (
                            <div className="flex items-end justify-center gap-0.5 h-10 px-4">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="w-1.5 bg-red-500 rounded-full"
                                        style={{ height: `${25 + Math.sin(Date.now() / 200 + i) * 15}px`,
                                                 animation: `soundbar ${0.3 + i * 0.05}s ease-in-out infinite alternate` }} />
                                ))}
                                <style>{`@keyframes soundbar{from{transform:scaleY(.3)}to{transform:scaleY(1)}}`}</style>
                            </div>
                        )}

                        {/* Transcript */}
                        {transcript && !isListening && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2 border text-xs">
                                <span className="text-slate-400">Query: </span>
                                <span className="font-semibold text-slate-800">"{transcript}"</span>
                            </div>
                        )}

                        {/* Text input — always visible */}
                        <div className="flex gap-1.5">
                            <input ref={inputRef} type="text" value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleText()}
                                placeholder="Type: heart attack, emergency…"
                                className="flex-grow text-xs border rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-indigo-400" />
                            <button onClick={() => handleText()}
                                disabled={!textInput.trim()}
                                className="px-2.5 bg-indigo-600 text-white rounded-lg disabled:opacity-40 hover:bg-indigo-700">
                                <Send size={13} />
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Result */}
                        {response?.hospital && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-green-700 mb-1">
                                    🏥 Best match · {response.hospital.survival_score}% survival
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
                                        className="flex-1 text-xs bg-green-600 text-white rounded-lg py-1.5 font-semibold hover:bg-green-700">
                                        Navigate
                                    </button>
                                    <button onClick={() => speak(response.response_text)}
                                        className="px-2.5 text-xs border border-green-300 text-green-700 rounded-lg hover:bg-green-50">
                                        <Volume2 size={13} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Mic button */}
                        <button onClick={isListening ? stopListening : startListening}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl font-semibold text-sm transition-all ${
                                isListening ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                            {isListening ? <><MicOff size={15} /> Stop</> : <><Mic size={15} /> Tap & Speak</>}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default VoiceQueryButton;