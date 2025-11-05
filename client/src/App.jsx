import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom'; 
import { Map, List } from 'lucide-react';
import MapView from './components/map/MapView';
import MainSearchView from './components/views/MainSearchView';
import HospitalDetailView from './components/views/HospitalDetailView';
import DoctorBookingModal from './components/modals/DoctorBookingModal';
import NavigationView from './components/views/NavigationView';
import Loader from './components/common/Loader';
import { getInitialHospitals, searchBySpecialty } from './services/apiService';

function App() {
    const [userLocation, setUserLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [mobileView, setMobileView] = useState('list');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchParams, setSearchParams] = useSearchParams();
    const query = useMemo(() => searchParams.get('q'), [searchParams]);
    const type = useMemo(() => searchParams.get('type'), [searchParams]);
    const radius = useMemo(() => searchParams.get('radiusKm') || '', [searchParams]);
    const selectedHospitalId = useMemo(() => searchParams.get('hospital'), [searchParams]);
    const navigatingToHospitalId = useMemo(() => searchParams.get('navigatingTo'), [searchParams]);
    const doctorIdToBook = useMemo(() => searchParams.get('bookDoctor'), [searchParams]);

    const selectedHospital = useMemo(() => {
        const id = selectedHospitalId || navigatingToHospitalId;
        if (!id) return null;
        return searchResults.find(h => h.hospital_id === parseInt(id));
    }, [selectedHospitalId, navigatingToHospitalId, searchResults]);

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = [position.coords.latitude, position.coords.longitude];
                setUserLocation(loc);
            },
            () => {
                setLocationError('Location access denied. Using a default location.');
                const loc = [22.34, 87.31];
                setUserLocation(loc);
            }
        );
    }, []);
    useEffect(() => {
        if (!userLocation) return;

        const fetchData = async () => {
            setIsLoading(true);
            setError('');
            try {
                let data;
                if (type === 'specialty' && query) {
                    data = await searchBySpecialty(
                        query, 
                        userLocation[0], 
                        userLocation[1], 
                        null, 
                        radius
                    );
                } else {
                    data = await getInitialHospitals(
                        userLocation[0], 
                        userLocation[1], 
                        radius
                    );
                }
                setSearchResults(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchData();

    }, [userLocation, query, type, radius]); 
    const handleSetSearch = (params) => {
        const currentRadius = searchParams.get('radiusKm');
        if (currentRadius) {
            params.radiusKm = currentRadius;
        }
        setSearchParams(params, { replace: true });
    };
    
    const handleSetRadius = (newRadius) => {
        const newParams = { ...Object.fromEntries(searchParams) };
        if (newRadius) {
            newParams.radiusKm = newRadius;
        } else {
            delete newParams.radiusKm;
        }
        setSearchParams(newParams, { replace: true });
    };

    const handleHospitalSelect = (hospitalId) => {
        const newParams = { ...Object.fromEntries(searchParams) };
        newParams.hospital = hospitalId;
        delete newParams.navigatingTo;
        setSearchParams(newParams, { replace: true });
        setMobileView('list');
    };

    const handleDoctorSelect = (doctorId) => {
        setSearchParams({ ...Object.fromEntries(searchParams), bookDoctor: doctorId });
    };

    const handleStartNavigation = (hospitalId) => {
        setSearchParams({ navigatingTo: hospitalId });
    };

    const handleBackToSearch = () => {
        const newParams = { ...Object.fromEntries(searchParams) };
        delete newParams.hospital;
        delete newParams.bookDoctor;
        delete newParams.navigatingTo;
        setSearchParams(newParams, { replace: true });
    };

    const closeModal = () => {
        const newParams = { ...Object.fromEntries(searchParams) };
        delete newParams.bookDoctor;
        setSearchParams(newParams, { replace: true });
    };

    const renderLeftPanel = () => {
        if (!userLocation) {
            return <Loader message={locationError || "Fetching your location..."} />;
        }
        
        if (selectedHospitalId) {
            return (
                <HospitalDetailView
                    hospital={selectedHospital} 
                    onBack={handleBackToSearch}
                    onDoctorSelect={handleDoctorSelect}
                    onStartNavigation={handleStartNavigation}
                />
            );
        } else {
            return (
                <MainSearchView
                    userLocation={userLocation}
                    onHospitalSelect={handleHospitalSelect}
                    onDoctorSelect={handleDoctorSelect}
                    onSetSearch={handleSetSearch} 
                    radius={radius}
                    setRadius={handleSetRadius}
                    searchResults={searchResults}
                    isLoading={isLoading}
                    error={error}
                />
            );
        }
    };

    
    if (navigatingToHospitalId && selectedHospital && userLocation) {
        return (
            <NavigationView
                userLocation={userLocation}
                hospital={selectedHospital}
                onClose={handleBackToSearch}
            />
        );
    }

    // Main App View
    return (
        <div className="h-screen w-full bg-slate-100 flex flex-col md:flex-row overflow-hidden relative">
            <div
                className={`absolute md:relative w-full h-full md:w-[45%] lg:w-[35%] z-20 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${mobileView === "list" ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 `}
            >
                <div className="h-full overflow-y-auto">
                    {renderLeftPanel()}
                </div>
            </div>
            
            <div
                className={`absolute md:relative w-full h-full md:w-[55%] lg:w-[65%] z-10 ${mobileView === "map" ? "block" : "hidden"} md:block`}
            >
                <MapView
                    userLocation={userLocation}
                    hospitals={searchResults} 
                    hospital={selectedHospital}
                    onMarkerClick={handleHospitalSelect}
                    searchType={type} 
                    radiusKm={radius}
                />
            </div>
            
            <div className="md:hidden absolute bottom-4 right-4 z-30 flex gap-2">
                <button
                    onClick={() => setMobileView(mobileView === "list" ? "map" : "list")}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
                >
                    {mobileView === "list" ? <Map size={20} /> : <List size={20} />}
                    <span>{mobileView === "list" ? "Map" : "List"}</span>
                </button>
            </div>
            
            {doctorIdToBook && userLocation && (
                <DoctorBookingModal
                    doctorId={doctorIdToBook}
                    hospitalId={selectedHospitalId}
                    userLocation={userLocation}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}

export default App;