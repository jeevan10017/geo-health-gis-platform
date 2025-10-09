import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, User, Stethoscope, Hospital } from 'lucide-react';
import { fetchAutocompleteSuggestions } from '../../services/apiService';
import { useDebounce } from '../../hooks/useDebounce';

const getIcon = (type) => {
    switch (type) {
        case 'doctor': return <User className="w-5 h-5 text-slate-500" />;
        case 'specialty': return <Stethoscope className="w-5 h-5 text-slate-500" />;
        case 'hospital': return <Hospital className="w-5 h-5 text-slate-500" />;
        default: return <Search className="w-5 h-5 text-slate-500" />;
    }
};

const SearchBar = ({ onSearch, userLocation }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isFocused, setIsFocused] = useState(false);
    const debouncedQuery = useDebounce(query, 300);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (debouncedQuery.length > 1 && userLocation) {
                const results = await fetchAutocompleteSuggestions(debouncedQuery, userLocation[0], userLocation[1]);
                setSuggestions(results);
            } else {
                setSuggestions([]);
            }
        };
        fetchSuggestions();
    }, [debouncedQuery, userLocation]);

    // Handle clicks outside the search bar to close suggestions
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);


    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion.primary_text);
        setSuggestions([]);
        setIsFocused(false);
        onSearch(suggestion);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Specialty, Doctor, or Hospital..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
            </div>
            {isFocused && suggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-80 overflow-y-auto">
                    {suggestions.map((s, index) => (
                        <li
                            key={`${s.type}-${s.id}-${index}`}
                            onClick={() => handleSuggestionClick(s)}
                            className="flex items-center gap-4 p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0"
                        >
                            <div className="flex-shrink-0">{getIcon(s.type)}</div>
                            <div className="flex-grow">
                                <p className="font-semibold text-slate-800">{s.primary_text}</p>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>{s.secondary_text}</span>
                                    <span className="font-medium uppercase tracking-wider">{s.tertiary_text}</span>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBar;