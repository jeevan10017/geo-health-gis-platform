import React, { useState } from 'react';

const specializations = ["Cardiology", "Pediatrics", "Orthopedics", "General Medicine"];

function SearchBar({ onSearch, isLoading }) {
  const [selectedSpec, setSelectedSpec] = useState(specializations[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(selectedSpec);
  };

  return (
    <form onSubmit={handleSubmit} className="search-bar">
      <label htmlFor="specialization">Select Specialization:</label>
      <select
        id="specialization"
        value={selectedSpec}
        onChange={(e) => setSelectedSpec(e.target.value)}
        disabled={isLoading}
      >
        {specializations.map(spec => (
          <option key={spec} value={spec}>{spec}</option>
        ))}
      </select>
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Find Nearest Doctor'}
      </button>
    </form>
  );
}

export default SearchBar;