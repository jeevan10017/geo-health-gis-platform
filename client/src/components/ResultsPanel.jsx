import React from 'react';

function ResultsPanel({ results }) {
  if (!results || results.length === 0) {
    return <div className="results-panel"><p>No results to display.</p></div>;
  }

  return (
    <div className="results-panel">
      <h3>Search Results</h3>
      <ul>
        {results.map((result, index) => (
          <li key={index}>
            <strong>{result.hospital_name}</strong>
            <p>{result.address}</p>
            <p><strong>Distance:</strong> {(result.distance_in_meters / 1000).toFixed(2)} km</p>
            <p><strong>Available Doctors:</strong> {result.available_doctors.join(', ')}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResultsPanel;