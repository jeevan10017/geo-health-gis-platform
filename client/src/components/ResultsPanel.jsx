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
            <div className="doctor-list">
              <strong>Available Doctors:</strong>
              <ul>
                {result.available_doctors.map((doctor, docIndex) => (
                  <li key={docIndex}>
                    {doctor.name} ({doctor.start_time} - {doctor.end_time})
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResultsPanel;