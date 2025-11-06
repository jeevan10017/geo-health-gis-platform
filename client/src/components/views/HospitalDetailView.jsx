import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDoctorsForHospital } from '../../services/apiService';
import { useDebounce } from '../../hooks/useDebounce';
import { Search, Calendar, ArrowLeft } from 'lucide-react';
import DoctorCard from '../cards/DoctorCard';
import DoctorScheduleCard from '../cards/DoctorScheduleCard'; 
import Loader from '../common/Loader';
import DatePicker from 'react-datepicker'; 
import "react-datepicker/dist/react-datepicker.css";

const HospitalDetailView = ({ hospital, onBack, onDoctorSelect, onStartNavigation }) => {
    const [searchParams] = useSearchParams();
    const initialQuery = useMemo(() => searchParams.get('q') || '', [searchParams]);
    const [doctorsData, setDoctorsData] = useState({ isGroupedByDoctor: true, doctors: [] });
    const [filterQuery, setFilterQuery] = useState(initialQuery);
    const [filterDate, setFilterDate] = useState(''); // Default to empty
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const debouncedQuery = useDebounce(filterQuery, 400);

   useEffect(() => {
        const fetchDoctors = async () => {
            if (!hospital?.hospital_id) return;
            setIsLoading(true);
            try {
                const dateString = filterDate ? filterDate.toISOString().split('T')[0] : '';
                
                const data = await getDoctorsForHospital(
                    hospital.hospital_id, 
                    dateString, 
                    debouncedQuery
                );
                setDoctorsData(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDoctors();
    }, [hospital?.hospital_id, filterDate, debouncedQuery]);

    const renderDoctorList = () => {
        if (isLoading) return <Loader message="Finding doctors..." />;
        if (error) return <p className="p-4 text-red-600">{error}</p>;
        if (doctorsData.doctors.length === 0) {
            return <p className="text-slate-500 text-center py-4">No doctors found for the selected criteria.</p>;
        }

        if (doctorsData.isGroupedByDoctor) {
            return doctorsData.doctors.map(doc => (
                <DoctorScheduleCard 
                    key={doc.doctor_id} 
                    doctor={doc} 
                    onBook={onDoctorSelect}
                />
            ));
        }

        return doctorsData.doctors.map(doc => (
            <DoctorCard 
                key={doc.doctor_id} 
                doctor={doc}
                hospital={hospital} // Pass hospital for "Start" button logic
                onBook={onDoctorSelect}
                onStartNavigation={onStartNavigation}
            />
        ));
    };

    // This is the spinner that was stuck
    if (!hospital) return <Loader message="Loading hospital details..." />;

    return (
        <div className="p-4 h-full flex flex-col">
            <div>
                <button onClick={onBack} className="mb-4 flex items-center gap-2 rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300">
                    <ArrowLeft size={16} /> Back to Results
                </button>
                <h2 className="text-2xl font-bold text-slate-800">{hospital.hospital_name}</h2>
                <p className="mt-1 text-slate-600">{hospital.address}</p>
                {hospital.phone && <p className="mt-1 text-sm text-slate-600">Phone: {hospital.phone}</p>}
                <hr className="my-4" />

                <h3 className="font-bold text-slate-800">Available Doctors</h3>
                <div className="space-y-3 mt-2">
                    {/* Name/Specialty Filter */}
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
                    {/* Date Filter */}
                   <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 z-10" />
                        <DatePicker
                            selected={filterDate} 
                            onChange={(date) => setFilterDate(date)} 
                            isClearable 
                            minDate={new Date()}
                            placeholderText="Click to select a date"
                            dateFormat="dd-MM-yyyy"
                            className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                        />
                    </div>
                </div>
            </div>
            
            {/* Doctor List */}
            <div className="mt-4 space-y-3 flex-grow overflow-y-auto pr-2">
                {renderDoctorList()}
            </div>
        </div>
    );
};

export default HospitalDetailView;