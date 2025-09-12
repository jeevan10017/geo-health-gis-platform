import React, { useState } from 'react';

function SearchBar({ onSearch, isLoading }) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSearch(query);
    };

    return (
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <input
                type="text"
                placeholder="Search by Hospital, Doctor, or Specialization"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading}
                className="flex-grow rounded-md border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
                type="submit"
                disabled={isLoading}
                className="rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300"
            >
                {isLoading ? '...' : 'Search'}
            </button>
        </form>
    );
}

export default SearchBar;