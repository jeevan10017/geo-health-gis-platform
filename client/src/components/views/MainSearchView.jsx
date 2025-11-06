import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import SearchBar from "../common/SearchBar";
import HospitalCard from "../cards/HospitalCard";
import SpecialtyResultCard from "../cards/SpecialtyResultCard";
import Loader from "../common/Loader";
import Select from "react-select";

// Custom theme for react-select
const selectTheme = (theme) => ({
  ...theme,
  colors: {
    ...theme.colors,
    primary: "#4f46e5",
    primary75: "#6366f1",
    primary50: "#818cf8",
    primary25: "#eef2ff",
  },
});

// Dropdown options
const radiusOptions = [
  { value: "", label: "All Hospitals" },
  { value: "5", label: "Within 5 km" },
  { value: "10", label: "Within 10 km" },
  { value: "25", label: "Within 25 km" },
  { value: "40", label: "Within 40 km" },
];

const MainSearchView = ({
  userLocation,
  onHospitalSelect,
  onDoctorSelect,
  onSetSearch,
  radius,
  setRadius,
  searchResults,
  isLoading,
  error,
}) => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q");
  const type = searchParams.get("type");
  const [searchTitle, setSearchTitle] = useState("Nearby Hospitals");

  useEffect(() => {
    if (type === "specialty" && query) {
      setSearchTitle(`Results for "${query}"`);
    } else {
      setSearchTitle("Nearby Hospitals");
    }
  }, [query, type]);

  const handleSearch = (suggestion) => {
    if (suggestion.type === "specialty") {
      onSetSearch({ q: suggestion.primary_text, type: suggestion.type });
    } else if (suggestion.type === "hospital") {
      onHospitalSelect(suggestion.id);
    } else if (suggestion.type === "doctor") {
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

    return searchResults.map((item) =>
      type === "specialty" ? (
        <SpecialtyResultCard
          key={item.hospital_id}
          hospital={item}
          onClick={onHospitalSelect}
        />
      ) : (
        <HospitalCard
          key={item.hospital_id}
          hospital={item}
          onClick={onHospitalSelect}
        />
      )
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Find a Doctor</h1>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-[70%]">
          <SearchBar onSearch={handleSearch} userLocation={userLocation} />
        </div>

        <div className="w-full sm:w-[30%] relative z-20">
          <div className="pl-0 sm:pl-2">
            <Select
              options={radiusOptions}
              defaultValue={radiusOptions.find((o) => o.value === radius)}
              onChange={(opt) => setRadius(opt.value)}
              theme={selectTheme}
              classNamePrefix="geo"
              placeholder="Filter distance..."
              styles={{
                control: (base) => ({
                  ...base,
                  borderRadius: "0.5rem",
                  paddingLeft: "0.25rem",
                  boxShadow: "none",
                  minHeight: "40px",
                  fontSize: window.innerWidth < 640 ? "12px" : "14px", // smaller on mobile
                }),
                option: (base) => ({
                  ...base,
                  fontSize: window.innerWidth < 640 ? "12px" : "14px", // smaller dropdown text
                  padding: "8px 10px",
                }),
                singleValue: (base) => ({
                  ...base,
                  fontSize: window.innerWidth < 640 ? "12px" : "14px",
                }),
              }}
            />
          </div>
        </div>
      </div>

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
