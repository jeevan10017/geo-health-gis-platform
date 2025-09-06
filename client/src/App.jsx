import React, { useState, useEffect } from 'react';
import MapView from './components/MapView';
import SearchBar from './components/SearchBar';
import ResultsPanel from './components/ResultsPanel';
import { getAllHospitals, findNearest } from './services/apiService';
import './App.css'; // Main app styles

function App() {
  // State for all hospitals to display on the map initially
  const [hospitals, setHospitals] = useState(null);
  // State for the search results
  const [searchResults, setSearchResults] = useState([]);
  // State to manage loading indicators
  const [isLoading, setIsLoading] = useState(false);
  // State for any errors that occur during API calls
  const [error, setError] = useState('');
  // State to hold the user's current location
  const [userLocation, setUserLocation] = useState(null);

  // Fetch all hospitals when the component mounts
  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const hospitalData = await getAllHospitals();
        setHospitals(hospitalData);
      } catch (err) {
        setError('Failed to load hospital data.');
      }
    };
    fetchHospitals();
  }, []);

  // Function to handle the search logic
  const handleSearch = (specialization) => {
    // Get user's location
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSearchResults([]);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        try {
          const results = await findNearest(latitude, longitude, specialization);
          setSearchResults(results);
        } catch (err) {
          setError(err.message || 'No doctors found or an error occurred.');
        } finally {
          setIsLoading(false);
        }
      },
      () => {
        setError('Unable to retrieve your location.');
        setIsLoading(false);
      }
    );
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <h1>Geo-Health Platform</h1>
        <p>Find specialist doctors in West Midnapore</p>
        <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        {error && <p className="error-message">{error}</p>}
        <ResultsPanel results={searchResults} />
      </div>
      <div className="map-container">
        <MapView hospitals={hospitals} userLocation={userLocation} />
      </div>
    </div>
  );
}

export default App;