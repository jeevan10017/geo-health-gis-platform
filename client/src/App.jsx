import React, { useState, useEffect } from 'react';
import SearchBar from './components/SearchBar';
import HospitalCard from './components/HospitalCard';
import MapView from './components/MapView';
import { searchHospitals, getDoctorsForHospital } from './services/apiService';

const getTodayString = () => new Date().toISOString().split('T')[0];

function App() {
    // --- State Management ---
    const [userLocation, setUserLocation] = useState(null);
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [doctors, setDoctors] = useState([]);
    const [selectedDate, setSelectedDate] = useState(getTodayString());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // NEW: State to hold the search query for doctors within a specific hospital
    const [doctorSearchQuery, setDoctorSearchQuery] = useState('');

    // --- Hooks for fetching data (no changes) ---
    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.');
            setIsLoading(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation([latitude, longitude]);
            },
            () => {
                setError('Unable to retrieve your location.');
                setIsLoading(false);
            }
        );
    }, []);

    useEffect(() => {
        if (userLocation) {
            fetchHospitals('');
        }
    }, [userLocation]);

    useEffect(() => {
        if (selectedHospital) {
            const fetchDoctors = async () => {
                try {
                    // Reset previous search results before fetching new ones
                    setDoctorSearchQuery('');
                    const doctorData = await getDoctorsForHospital(selectedHospital.hospital_id, selectedDate);
                    setDoctors(doctorData);
                } catch (err) {
                    setError(err.message);
                }
            };
            fetchDoctors();
        }
    }, [selectedHospital, selectedDate]);

    // --- Data fetching functions (no changes) ---
    const fetchHospitals = async (query) => {
        setIsLoading(true);
        setError('');
        try {
            const results = await searchHospitals(userLocation[0], userLocation[1], query);
            setHospitals(results);
        } catch (err) {
            setError(err.message);
            setHospitals([]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Event Handlers ---
    const handleSearch = (query) => {
        setSelectedHospital(null);
        fetchHospitals(query);
    };
    
    const handleSelectHospital = (hospital) => {
        setSelectedHospital(hospital);
    };

    const handleBackToList = () => {
        setSelectedHospital(null);
        setDoctors([]);
        // MODIFIED: Also reset the doctor search query
        setDoctorSearchQuery('');
    };
    
    // NEW: Filter the doctors based on the search query before rendering
    const filteredDoctors = doctors.filter(doc =>
        doc.name.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
        doc.specialization.toLowerCase().includes(doctorSearchQuery.toLowerCase())
    );

    // --- Render Logic ---
    if (isLoading && !hospitals.length) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <h1 className="text-xl font-semibold text-slate-700">Finding nearby hospitals...</h1>
            </div>
        );
    }

    if (error && !hospitals.length) {
        return (
            <div className="flex h-screen items-center justify-center bg-red-50">
                <h1 className="text-xl font-semibold text-red-700">Error: {error}</h1>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full font-sans">
            {!selectedHospital ? (
                // VIEW 1: Hospital List
                <div className="flex w-full flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 p-6 md:w-1/2 lg:w-1/3">
                    <h1 className="text-3xl font-bold text-slate-800">Geo-Health Platform</h1>
                    <p className="mt-1 mb-6 text-slate-600">Find specialist doctors near Kharagpur</p>
                    <SearchBar onSearch={handleSearch} isLoading={isLoading} />
                    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                    <div className="mt-6 flex flex-col gap-3">
                        {hospitals.map(h => (
                            <HospitalCard key={h.hospital_id} hospital={h} onSelect={handleSelectHospital} />
                        ))}
                    </div>
                </div>
            ) : (
                // VIEW 2: Hospital Detail
                <>
                    <div className="w-full md:w-2/3">
                        <MapView userLocation={userLocation} hospital={selectedHospital} />
                    </div>
                    <div className="flex w-full flex-col overflow-y-auto bg-white p-6 md:w-1/3">
                        <button
                            onClick={handleBackToList}
                            className="mb-4 self-start rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300"
                        >
                            &larr; Back to List
                        </button>
                        <h2 className="text-2xl font-bold text-slate-800">{selectedHospital.name}</h2>
                        <p className="mt-1 text-slate-600">{selectedHospital.address}</p>
                        <hr className="my-4" />
                        
                        {/* --- MODIFIED DOCTOR SECTION --- */}
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">Available Doctors</h3>
                            <label htmlFor="date-picker-detail" className="sr-only">Select Date</label>
                            <input
                                type="date"
                                id="date-picker-detail"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="block rounded-md border border-slate-300 p-1 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            />
                        </div>

                        {/* NEW: Doctor search/filter input */}
                        <div className="mt-3">
                            <label htmlFor="doctor-search" className="sr-only">Filter Doctors</label>
                            <input
                                type="text"
                                id="doctor-search"
                                placeholder="Filter by name or specialty..."
                                value={doctorSearchQuery}
                                onChange={(e) => setDoctorSearchQuery(e.target.value)}
                                className="w-full rounded-md border border-slate-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            />
                        </div>

                        {/* MODIFIED: The list now uses the `filteredDoctors` array */}
                        <div className="mt-4 flex flex-col gap-3">
                            {filteredDoctors.length > 0 ? (
                                filteredDoctors.map((doc, i) => (
                                    <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                        <p className="font-semibold text-slate-800">{doc.name}</p>
                                        <p className="text-sm text-slate-600">{doc.specialization}</p>
                                        <p className="mt-1 text-sm text-indigo-700">Time: {doc.start_time} - {doc.end_time}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="mt-2 text-slate-500">No doctors found matching your criteria for the selected date.</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default App;