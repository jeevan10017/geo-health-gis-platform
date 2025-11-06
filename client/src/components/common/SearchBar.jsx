import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Stethoscope, Hospital } from 'lucide-react';
import { fetchAutocompleteSuggestions } from '../../services/apiService';
import { useDebounce } from '../../hooks/useDebounce';

const getIcon = (type) => {
  switch (type) {
    case 'doctor': return <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
    case 'specialty': return <Stethoscope className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
    case 'hospital': return <Hospital className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
    default: return <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
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
        const results = await fetchAutocompleteSuggestions(
          debouncedQuery, userLocation[0], userLocation[1]
        );
        setSuggestions(results);
      } else setSuggestions([]);
    };
    fetchSuggestions();
  }, [debouncedQuery, userLocation]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.primary_text);
    setSuggestions([]);
    setIsFocused(false);
    onSearch(suggestion);
  };

  return (
    <div className="relative z-50" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
        <input
          type="text"
          placeholder="Specialty, Doctor, or Hospital..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 sm:py-2 text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((s, index) => (
            <li
              key={`${s.type}-${s.id}-${index}`}
              onClick={() => handleSuggestionClick(s)}
              className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0"
            >
              <div className="flex-shrink-0">{getIcon(s.type)}</div>
              <div className="flex-grow">
                <p className="font-semibold text-slate-800 text-sm sm:text-base">{s.primary_text}</p>
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-500">
                  <span>{s.secondary_text}</span>
                  <span
  className="font-medium uppercase tracking-wider truncate"
  style={{ maxWidth: '8rem', display: 'inline-block' }}
  title={s.tertiary_text}
>
  {s.tertiary_text.length > 30 ? s.tertiary_text.slice(0, 30) + '…' : s.tertiary_text}
</span>

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
