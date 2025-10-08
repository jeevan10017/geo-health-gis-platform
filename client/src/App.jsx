
import React, { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Calendar, Clock, Car, Star } from 'lucide-react';
import MapView from './components/MapView';
import { advancedSearch, getDoctorsForHospital } from './services/apiService';
import { useDebounce } from './hooks/useDebounce';

const getTodayString = () => new Date().toISOString().split('T')[0];

function App() {
    const [userLocation, setUserLocation] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [doctorsInHospital, setDoctorsInHospital] = useState([]);

    const [mainSearchQuery, setMainSearchQuery] = useState('');
    const [searchDate, setSearchDate] = useState('');
    const [searchTime, setSearchTime] = useState('');

    const [doctorFilterQuery, setDoctorFilterQuery] = useState('');
    const [doctorFilterDate, setDoctorFilterDate] = useState(getTodayString());

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const debouncedMainQuery = useDebounce(mainSearchQuery, 500);
    const debouncedDoctorQuery = useDebounce(doctorFilterQuery, 500);

    // Get user location
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation([latitude, longitude]);
            },
            () => {
                setError('Location access denied. Using default location.');
                setUserLocation([22.34, 87.31]); // Fallback to Kharagpur
            }
        );
    }, []);

    // Main search logic
    const runMainSearch = useCallback(async () => {
        if (!userLocation) return;
        setIsLoading(true);
        setError('');
        setSelectedHospital(null); // Clear selection on new search
        try {
            const params = {
                lat: userLocation[0],
                lon: userLocation[1],
                q: debouncedMainQuery,
                date: searchDate,
                time: searchTime,
            };
            Object.keys(params).forEach(key => !params[key] && delete params[key]);
            const results = await advancedSearch(params);
            setSearchResults(results);
        } catch (err) {
            setError(err.message);
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [userLocation, debouncedMainQuery, searchDate, searchTime]);

    useEffect(() => {
        if(userLocation) {
          runMainSearch();
        }
    }, [runMainSearch, userLocation]);

    // Fetch doctors for a selected hospital
    useEffect(() => {
        if (selectedHospital) {
            const fetchDoctors = async () => {
                try {
                    const doctorData = await getDoctorsForHospital(
                        selectedHospital.hospital_id,
                        doctorFilterDate,
                        debouncedDoctorQuery
                    );
                    setDoctorsInHospital(doctorData);
                } catch (err) {
                    setError(err.message);
                }
            };
            fetchDoctors();
        }
    }, [selectedHospital, doctorFilterDate, debouncedDoctorQuery]);

    // --- RENDER FUNCTIONS ---
    
    // UPDATED: This card now shows both distance and time
   // src/App.js -> renderHospitalCard function

const renderHospitalCard = (hospital) => (
    <div key={hospital.hospital_id} onClick={() => setSelectedHospital(hospital)}
        className="p-4 bg-white border rounded-lg shadow-sm hover:shadow-md hover:border-indigo-500 cursor-pointer transition-all">
        <h3 className="font-bold text-slate-800">{hospital.hospital_name}</h3>
        <p className="text-sm text-slate-600 mt-1 line-clamp-1">{hospital.address}</p>
        <div className="flex justify-between items-center mt-3 text-sm">
            <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                <Car size={16} />
                {/* This will now show the realistic time */}
                <span>~ {hospital.travel_time_minutes} min</span>
            </div>
            <div className="text-slate-500 font-medium">
                {/* This will now show the correct road distance */}
                {(hospital.route_distance_meters / 1000).toFixed(2)} km
            </div>
        </div>
            <p className="text-xs text-slate-500 mt-2">
            <span className="font-semibold text-green-600">{hospital.available_doctors.length}</span> matching doctor(s) available
        </p>
    </div>
);

    const renderDoctorCard = (doctor) => (
         <div key={doctor.doctor_id} className="p-3 bg-slate-50 border rounded-md">
            <p className="font-semibold text-slate-800">{doctor.name}</p>
            <p className="text-sm text-slate-600">{doctor.specialization}</p>
            <p className="mt-1 text-sm text-indigo-700 font-medium">
                Time: {doctor.start_time} - {doctor.end_time}
            </p>
        </div>
    );

    return (
        <div className="flex h-screen w-full font-sans bg-slate-100">
            {/* Left Panel */}
            <div className="flex w-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 md:w-1/2 lg:w-1/3">
                {!selectedHospital ? (
                    <div className="p-4">
                        {/* Search Form and Results */}
                        <h1 className="text-2xl font-bold text-slate-800">Find a Doctor</h1>
                        {/* ... (rest of search form is the same) ... */}
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"/>
                                <input type="text" placeholder="Hospital, Doctor, or Specialty..." value={mainSearchQuery}
                                    onChange={(e) => setMainSearchQuery(e.target.value)}
                                    className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 focus:ring-indigo-500"/>
                            </div>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"/>
                                    <input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)}
                                    className="w-full rounded-md border border-slate-300 pl-10 pr-2 py-2"/>
                                </div>
                                <div className="relative flex-1">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"/>
                                    <input type="time" value={searchTime} onChange={(e) => setSearchTime(e.target.value)}
                                    className="w-full rounded-md border border-slate-300 pl-10 pr-2 py-2"/>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 space-y-3">
                            {isLoading && <p>Loading...</p>}
                            {error && <p className="text-red-600">{error}</p>}
                            {!isLoading && searchResults.map(renderHospitalCard)}
                            {!isLoading && !error && searchResults.length === 0 && <p>No results match your criteria.</p>}
                        </div>
                    </div>
                ) : (
                    <div className="p-4">
                        {/* Hospital Detail View */}
                        <button onClick={() => setSelectedHospital(null)} className="mb-4 flex items-center gap-2 rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300">
                             &larr; Back to Results
                        </button>
                        <h2 className="text-xl font-bold text-slate-800">{selectedHospital.hospital_name}</h2>
                        {/* ... (rest of detail view is the same) ... */}
                         <p className="mt-1 text-slate-600">{selectedHospital.address}</p>
                        <hr className="my-4" />
                        
                        <h3 className="font-bold text-slate-800">Find Doctors in this Hospital</h3>
                         <div className="space-y-3 mt-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"/>
                                <input type="text" placeholder="Filter by name or specialty..." value={doctorFilterQuery}
                                    onChange={(e) => setDoctorFilterQuery(e.target.value)}
                                    className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2"/>
                            </div>
                             <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"/>
                                <input type="date" value={doctorFilterDate} onChange={(e) => setDoctorFilterDate(e.target.value)}
                                className="w-full rounded-md border border-slate-300 pl-10 pr-2 py-2"/>
                            </div>
                        </div>
                        
                        <div className="mt-4 space-y-3">
                            {doctorsInHospital.length > 0 ? (
                                doctorsInHospital.map(renderDoctorCard)
                            ) : (
                                <p className="text-slate-500">No doctors found for the selected criteria.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {/* Right Panel: Map */}
            <div className="hidden md:block md:w-1/2 lg:w-2/3">
                 <MapView
                    userLocation={userLocation}
                    hospitals={searchResults}
                    hospital={selectedHospital}
                />
            </div>
        </div>
    );
}

export default App;