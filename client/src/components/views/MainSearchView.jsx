import React, { useState, useEffect } from "react";
import { useSearchParams } from 'react-router-dom';
import SearchBar from "../common/SearchBar";
import HospitalCard from "../cards/HospitalCard";
import SpecialtyResultCard from "../cards/SpecialtyResultCard";
import Loader from "../common/Loader";
import { SlidersHorizontal } from "lucide-react";

// This component is now much simpler. It just receives props.
const MainSearchView = ({
  userLocation,
  onHospitalSelect,
  onDoctorSelect,
  onSetSearch, // Function to update the URL params
  radius,
  setRadius,
  searchResults, // Data is passed in
  isLoading,     // Loading state is passed in
  error          
}) => {

  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  const type = searchParams.get('type');

  // This state is just for the title
  const [searchTitle, setSearchTitle] = useState("Nearby Hospitals");

  useEffect(() => {
    if (type === 'specialty' && query) {
      setSearchTitle(`Results for "${query}"`);
    } else {
      setSearchTitle("Nearby Hospitals");
    }
  }, [query, type]);

  // handleSearch now just updates the URL. The effect in App.jsx will do the fetching.
  const handleSearch = (suggestion) => {
    if (suggestion.type === 'specialty') {
      onSetSearch({ q: suggestion.primary_text, type: suggestion.type });
    } else if (suggestion.type === 'hospital') {
      onHospitalSelect(suggestion.id);
    } else if (suggestion.type === 'doctor') {
      onDoctorSelect(suggestion.id);
    }
  };

  const renderResults = () => {
    if (isLoading) return <Loader />;
    if (error) return <p className="text-center text-red-600 p-4">{error}</p>;
    if (searchResults.length === 0)
      return (
        <p className="text-center text-slate-500 p-4">No results found.</p>
      );

    return searchResults.map((item) => {
      if (type === "specialty") {
        return (
          <SpecialtyResultCard
            key={item.hospital_id}
            hospital={item}
            onClick={onHospitalSelect}
          />
        );
      }
      return (
        <HospitalCard
          key={item.hospital_id}
          hospital={item}
          onClick={onHospitalSelect}
        />
      );
    });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">
        Find a Doctor
      </h1>
      <SearchBar onSearch={handleSearch} userLocation={userLocation} />

      {/* --- GEOFENCE DROPDOWN --- */}
      <div className="relative">
        <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <select 
          value={radius} 
          onChange={(e) => setRadius(e.target.value)}
          className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All Hospitals</option>
          <option value="5">Within 5 km</option>
          <option value="10">Within 10 km</option>
          <option value="25">Within 25 km</option>
        </select>
      </div>
      {/* --- END NEW DROPDOWN --- */}

      <h2 className="text-lg font-semibold text-slate-700 pt-2">
        {searchTitle}
      </h2>
      <div className="space-y-3 max-h-[calc(100vh-270px)] overflow-y-auto pr-2">
        {renderResults()}
      </div>
    </div>
  );
};

export default MainSearchView;