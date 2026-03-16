
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDoctorsForHospital } from '../../services/apiService';
import { useDebounce } from '../../hooks/useDebounce';
import { Search, Calendar, ArrowLeft, AlertTriangle } from 'lucide-react';
import DoctorCard from '../cards/DoctorCard';
import DoctorScheduleCard from '../cards/DoctorScheduleCard';
import Loader from '../common/Loader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const HospitalDetailView = ({ hospital, onBack, onDoctorSelect, onStartNavigation }) => {
    const [searchParams] = useSearchParams();
    const initialQuery = useMemo(() => searchParams.get('q') || '', [searchParams]);

    const [doctorsData,  setDoctorsData]  = useState({ isGroupedByDoctor: true, doctors: [] });
    const [filterQuery,  setFilterQuery]  = useState(initialQuery);
    const [filterDate,   setFilterDate]   = useState('');
    const [isLoading,    setIsLoading]    = useState(true);
    const [error,        setError]        = useState('');
    // Blink state — true when date selected + 0 doctors returned
    const [noDoctorWarn, setNoDoctorWarn] = useState(false);

    const debouncedQuery = useDebounce(filterQuery, 400);

    useEffect(() => {
        const fetchDoctors = async () => {
            if (!hospital?.hospital_id) return;
            setIsLoading(true);
            setNoDoctorWarn(false);
            try {
                const dateString = filterDate
                    ? filterDate.toISOString().split('T')[0]
                    : '';
                const data = await getDoctorsForHospital(
                    hospital.hospital_id, dateString, debouncedQuery
                );
                setDoctorsData(data);
                // Only warn if user explicitly picked a date and got nothing
                if (filterDate && data.doctors.length === 0) {
                    setNoDoctorWarn(true);
                }
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
        if (error)     return <p className="p-4 text-red-600">{error}</p>;
        if (doctorsData.doctors.length === 0) {
            return (
                <p className="text-slate-500 text-center py-4">
                    No doctors found for the selected criteria.
                </p>
            );
        }
        if (doctorsData.isGroupedByDoctor) {
            return doctorsData.doctors.map(doc => (
                <DoctorScheduleCard key={doc.doctor_id} doctor={doc} onBook={onDoctorSelect} />
            ));
        }
        return doctorsData.doctors.map(doc => (
            <DoctorCard
                key={doc.doctor_id}
                doctor={doc}
                hospital={hospital}
                onBook={onDoctorSelect}
                onStartNavigation={onStartNavigation}
            />
        ));
    };

    if (!hospital) return <Loader message="Loading hospital details..." />;

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex-shrink-0">
                <button
                    onClick={onBack}
                    className="mb-4 flex items-center gap-2 rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300"
                >
                    <ArrowLeft size={16} /> Back to Results
                </button>
                <h2 className="text-2xl font-bold text-slate-800">{hospital.hospital_name}</h2>
                <p className="mt-1 text-slate-600">{hospital.address}</p>
                {hospital.phone && (
                    <p className="mt-1 text-sm text-slate-600">Phone: {hospital.phone}</p>
                )}
                <hr className="my-4" />

                <h3 className="font-bold text-slate-800">Available Doctors</h3>

                <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:gap-4">
                    <div className="relative w-full sm:w-3/5">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Filter by name or specialty..."
                            value={filterQuery}
                            onChange={e => setFilterQuery(e.target.value)}
                            className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div className="relative w-full sm:w-2/5 mt-3 sm:mt-0">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 z-10" />
                        <DatePicker
                            selected={filterDate}
                            onChange={date => setFilterDate(date)}
                            isClearable
                            minDate={new Date()}
                            placeholderText="Select date (optional)"
                            dateFormat="dd-MM-yyyy"
                            className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* ── Blinking warning when date selected but no doctors ── */}
                {noDoctorWarn && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 animate-pulse">
                        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-amber-800">
                                No doctors available on this date
                            </p>
                            <p className="text-xs text-amber-600 mt-0.5">
                                Try a different date or clear the filter to see the full weekly schedule.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-4 space-y-3 flex-grow overflow-y-auto pr-2">
                {renderDoctorList()}
            </div>
        </div>
    );
};

export default HospitalDetailView;