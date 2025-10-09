import React, { useState, useEffect, useCallback } from 'react';
import { getInitialHospitals, searchBySpecialty } from '../../services/apiService';
import SearchBar from '../common/SearchBar';
import HospitalCard from '../cards/HospitalCard';
import SpecialtyResultCard from '../cards/SpecialtyResultCard';
import Loader from '../common/Loader';

// Add onUpdateResults to props
const MainSearchView = ({ userLocation, onHospitalSelect, onDoctorSelect, onUpdateResults }) => {
    const [results, setResults] = useState([]);
    const [searchType, setSearchType] = useState('initial');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTitle, setSearchTitle] = useState('Nearby Hospitals');

    const fetchInitialData = useCallback(async () => {
        if (!userLocation) return;
        setIsLoading(true);
        setError('');
        try {
            const initialHospitals = await getInitialHospitals(userLocation[0], userLocation[1]);
            setResults(initialHospitals);
            onUpdateResults(initialHospitals); // <-- KEY FIX: Update parent state
            setSearchType('initial');
            setSearchTitle('Nearby Hospitals');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [userLocation, onUpdateResults]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const handleSearch = async (suggestion) => {
        setIsLoading(true);
        setError('');
        setResults([]);
        onUpdateResults([]); // Clear parent state immediately

        switch (suggestion.type) {
            case 'specialty':
                try {
                    setSearchTitle(`Results for "${suggestion.primary_text}"`);
                    const specialtyResults = await searchBySpecialty(suggestion.primary_text, userLocation[0], userLocation[1]);
                    setResults(specialtyResults);
                    onUpdateResults(specialtyResults); // <-- KEY FIX: Update parent state
                    setSearchType('specialty');
                } catch (err) {
                    setError(err.message);
                }
                break;
            case 'hospital':
                onHospitalSelect(suggestion.id);
                // We fetch fresh results to populate the map correctly for context
                fetchInitialData();
                break;
            case 'doctor':
                onDoctorSelect(suggestion.id);
                 // We fetch fresh results to populate the map correctly for context
                fetchInitialData();
                break;
            default:
                await fetchInitialData();
                break;
        }
        setIsLoading(false);
    };

    const renderResults = () => {
        if (isLoading) return <Loader />;
        if (error) return <p className="text-center text-red-600 p-4">{error}</p>;
        if (results.length === 0) return <p className="text-center text-slate-500 p-4">No results found.</p>;

        return results.map(item => {
            if (searchType === 'specialty') {
                return <SpecialtyResultCard key={item.hospital_id} hospital={item} onClick={onHospitalSelect} />;
            }
            return <HospitalCard key={item.hospital_id} hospital={item} onClick={onHospitalSelect} />;
        });
    };
    
    return (
        <div className="p-4 space-y-4">
            <h1 className="text-2xl font-bold text-slate-800">Find a Doctor</h1>
            <SearchBar onSearch={handleSearch} userLocation={userLocation} />
            <h2 className="text-lg font-semibold text-slate-700 pt-2">{searchTitle}</h2>
            <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                {renderResults()}
            </div>
        </div>
    );
};

export default MainSearchView;