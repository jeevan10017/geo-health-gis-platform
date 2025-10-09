import React, { useState, useEffect } from 'react';
import { Map, List } from 'lucide-react';

import MapView from './components/map/MapView';
import MainSearchView from './components/views/MainSearchView';
import HospitalDetailView from './components/views/HospitalDetailView';
import DoctorBookingModal from './components/modals/DoctorBookingModal';
import Loader from './components/common/Loader';

function App() {
    // --- State Management ---
    const [userLocation, setUserLocation] = useState(null);
    const [locationError, setLocationError] = useState('');

    // View & Selection State
    const [currentView, setCurrentView] = useState('mainSearch');
    const [selectedHospital, setSelectedHospital] = useState(null); // Now holds the full hospital object
    const [selectedDoctor, setSelectedDoctor] = useState({ doctorId: null, hospitalId: null });

    // Lifted State for Map Sync
    const [searchResults, setSearchResults] = useState([]);
    const [mapCenter, setMapCenter] = useState([22.34, 87.31]);

    // Mobile-specific State
    const [mobileView, setMobileView] = useState('list'); // 'list' or 'map'

    // --- Effects ---
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = [position.coords.latitude, position.coords.longitude];
                setUserLocation(loc);
                setMapCenter(loc);
            },
            () => {
                setLocationError('Location access denied. Using a default location.');
                const loc = [22.34, 87.31];
                setUserLocation(loc);
                setMapCenter(loc);
            }
        );
    }, []);

    // --- Handlers ---
    const handleHospitalSelect = (hospitalId) => {
        const hospitalData = searchResults.find(h => h.hospital_id === hospitalId);
        if (hospitalData) {
            setSelectedHospital(hospitalData);
            setMapCenter([hospitalData.lat, hospitalData.lon]);
            setCurrentView('hospitalDetail');
            setMobileView('list'); // Switch to list view on mobile to see details
        }
    };

    const handleDoctorSelect = (doctorId, hospitalId = null) => {
        setSelectedDoctor({ doctorId, hospitalId });
    };

    const handleBackToSearch = () => {
        setSelectedHospital(null);
        setCurrentView('mainSearch');
        if (userLocation) setMapCenter(userLocation);
    };

    const closeModal = () => {
        setSelectedDoctor({ doctorId: null, hospitalId: null });
    };

    // --- Render Logic ---
    const renderLeftPanel = () => {
        if (!userLocation) {
            return <Loader message={locationError || "Fetching your location..."} />;
        }
        switch (currentView) {
            case 'hospitalDetail':
                return (
                    <HospitalDetailView
                        hospitalId={selectedHospital.hospital_id}
                        onBack={handleBackToSearch}
                        onDoctorSelect={handleDoctorSelect}
                    />
                );
            default:
                return (
                    <MainSearchView
                        userLocation={userLocation}
                        onHospitalSelect={handleHospitalSelect}
                        onDoctorSelect={handleDoctorSelect}
                        // This is the key fix: update parent state on new results
                        onUpdateResults={setSearchResults}
                    />
                );
        }
    };

    return (
        <div className="h-screen w-full bg-slate-100 flex flex-col md:flex-row overflow-hidden relative">
            
            {/* --- Left Panel / Mobile List View --- */}
            <div className={`
                absolute md:relative w-full h-full md:w-[45%] lg:w-[35%] z-20 bg-white shadow-lg
                transform transition-transform duration-300 ease-in-out
                ${mobileView === 'list' ? 'translate-x-0' : '-translate-x-full'}
                md:translate-x-0
            `}>
                <div className="h-full overflow-y-auto">
                    {renderLeftPanel()}
                </div>
            </div>

            {/* --- Right Panel / Mobile Map View --- */}
            <div className={`
                absolute md:relative w-full h-full md:w-[55%] lg:w-[65%] z-10
                ${mobileView === 'map' ? 'block' : 'hidden'}
                md:block
            `}>
                <MapView
                    userLocation={userLocation}
                    hospitals={searchResults}
                    hospital={selectedHospital} // This now passes the full object, enabling routing!
                    onMarkerClick={handleHospitalSelect} // Allow map markers to select hospitals
                />
            </div>

            {/* --- Mobile View Toggle Button --- */}
            <div className="md:hidden absolute bottom-4 right-4 z-30 flex gap-2">
                <button
                    onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
                >
                    {mobileView === 'list' ? <Map size={20} /> : <List size={20} />}
                    <span>{mobileView === 'list' ? 'Map' : 'List'}</span>
                </button>
            </div>
            
            {/* --- Booking Modal --- */}
            {selectedDoctor.doctorId && userLocation && (
                <DoctorBookingModal
                    doctorId={selectedDoctor.doctorId}
                    hospitalId={selectedDoctor.hospitalId}
                    userLocation={userLocation}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}

export default App;