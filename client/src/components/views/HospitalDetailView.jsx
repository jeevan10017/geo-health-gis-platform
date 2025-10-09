import React, { useState, useEffect, useCallback } from 'react';
import { getHospitalDetails, getDoctorsForHospital } from '../../services/apiService';
import { useDebounce } from '../../hooks/useDebounce';
import { Search, Calendar, ArrowLeft } from 'lucide-react';
import DoctorCard from '../cards/DoctorCard';
import Loader from '../common/Loader';

const getTodayString = () => new Date().toISOString().split('T')[0];

const HospitalDetailView = ({ hospitalId, onBack, onDoctorSelect }) => {
    const [hospital, setHospital] = useState(null);
    const [doctors, setDoctors] = useState([]);
    const [filterQuery, setFilterQuery] = useState('');
    const [filterDate, setFilterDate] = useState(getTodayString());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const debouncedQuery = useDebounce(filterQuery, 400);

    useEffect(() => {
        const fetchDetails = async () => {
            setIsLoading(true);
            setError('');
            try {
                const hospitalData = await getHospitalDetails(hospitalId);
                setHospital(hospitalData);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [hospitalId]);
    
    useEffect(() => {
        const fetchDoctors = async () => {
            if (!hospitalId) return;
            try {
                const doctorData = await getDoctorsForHospital(hospitalId, filterDate, debouncedQuery);
                setDoctors(doctorData);
            } catch (err) {
                setError(err.message);
                setDoctors([]);
            }
        };
        fetchDoctors();
    }, [hospitalId, filterDate, debouncedQuery]);

    if (isLoading) return <Loader message="Loading hospital details..." />;
    if (error) return <p className="p-4 text-red-600">{error}</p>;
    if (!hospital) return null;

    return (
        <div className="p-4">
            <button onClick={onBack} className="mb-4 flex items-center gap-2 rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300">
                <ArrowLeft size={16} /> Back to Results
            </button>
            <h2 className="text-2xl font-bold text-slate-800">{hospital.name}</h2>
            <p className="mt-1 text-slate-600">{hospital.address}</p>
            {hospital.phone && <p className="mt-1 text-sm text-slate-600">Phone: {hospital.phone}</p>}
            <hr className="my-4" />

            <h3 className="font-bold text-slate-800">Available Doctors</h3>
            <div className="space-y-3 mt-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Filter by name or specialty..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2"
                    />
                </div>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 pl-10 pr-2 py-2"
                    />
                </div>
            </div>
            <div className="mt-4 space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                {doctors.length > 0 ? (
                    doctors.map(doc => <DoctorCard key={doc.doctor_id} doctor={doc} onBook={(doctor) => onDoctorSelect(doctor.doctor_id, hospitalId)}/>)
                ) : (
                    <p className="text-slate-500 text-center py-4">No doctors found for the selected criteria.</p>
                )}
            </div>
        </div>
    );
};

export default HospitalDetailView;