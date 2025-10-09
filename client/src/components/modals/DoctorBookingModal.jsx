import React, { useState, useEffect } from 'react';
import { getDoctorDetails } from '../../services/apiService';
import { X, Clock, Calendar, Hospital, CheckCircle, Info } from 'lucide-react';
import Loader from '../common/Loader';

const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const getDayOfWeek = (date) => (date.getDay() === 0 ? 7 : date.getDay()); // Sunday=7

const generateTimeSlots = (start, end, interval = 20) => {
    const slots = [];
    let currentTime = new Date(`1970-01-01T${start}`);
    const endTime = new Date(`1970-01-01T${end}`);
    
    while(currentTime < endTime) {
        slots.push(currentTime.toTimeString().substring(0, 5));
        currentTime.setMinutes(currentTime.getMinutes() + interval);
    }
    return slots;
};


const DoctorBookingModal = ({ doctorId, hospitalId: initialHospitalId, userLocation, onClose }) => {
    const [doctor, setDoctor] = useState(null);
    const [selectedHospitalId, setSelectedHospitalId] = useState(initialHospitalId);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [bookingConfirmed, setBookingConfirmed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchDoctor = async () => {
            setIsLoading(true);
            try {
                const data = await getDoctorDetails(doctorId, userLocation[0], userLocation[1]);
                setDoctor(data);
                if (!initialHospitalId && data.hospitals.length > 0) {
                    setSelectedHospitalId(data.hospitals[0].hospital_id);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDoctor();
    }, [doctorId, userLocation, initialHospitalId]);

    const selectedHospital = doctor?.hospitals.find(h => h.hospital_id === selectedHospitalId);
    const availableDays = selectedHospital?.schedules.map(s => s.day_of_week) || [];
    const scheduleForSelectedDate = selectedHospital?.schedules.find(s => s.day_of_week === getDayOfWeek(selectedDate));
    const timeSlots = scheduleForSelectedDate ? generateTimeSlots(scheduleForSelectedDate.start_time, scheduleForSelectedDate.end_time) : [];

    const handleBooking = () => {
        // Dummy booking
        setBookingConfirmed(true);
    };

    const getTravelSuggestion = () => {
        if (!selectedSlot || !selectedHospital) return '';
        const travelTimeMinutes = Math.round(((selectedHospital.distance_meters / 1000) / 40) * 60) + 5; // Using 40km/h average
        const appointmentTime = new Date(`${selectedDate.toDateString()} ${selectedSlot}`);
        const departureTime = new Date(appointmentTime.getTime() - travelTimeMinutes * 60000);
        return `Your appointment is at ${selectedSlot}. With an estimated travel time of ${travelTimeMinutes} minutes, we suggest you leave by ${departureTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`;
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-slate-800">Book Appointment</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X /></button>
                </div>

                {isLoading && <Loader />}
                {error && <p className="p-4 text-red-500">{error}</p>}
                
                {doctor && !bookingConfirmed && (
                    <div className="p-4 space-y-4">
                        <div>
                            <p className="text-lg font-semibold">{doctor.name}</p>
                            <p className="text-slate-600">{doctor.specialization}</p>
                        </div>

                        {/* Hospital Selection (if needed) */}
                        {!initialHospitalId && doctor.hospitals.length > 1 && (
                            <div>
                                <label className="font-semibold block mb-2">Select Hospital:</label>
                                <select 
                                    value={selectedHospitalId} 
                                    onChange={(e) => setSelectedHospitalId(parseInt(e.target.value))}
                                    className="w-full p-2 border rounded-md"
                                >
                                    {doctor.hospitals.map(h => (
                                        <option key={h.hospital_id} value={h.hospital_id}>
                                            {h.hospital_name} ({(h.distance_meters / 1000).toFixed(1)} km)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {selectedHospital && (
                            <>
                                <div className="p-3 bg-slate-50 rounded-md">
                                    <p className="font-semibold flex items-center gap-2"><Hospital size={16}/> {selectedHospital.hospital_name}</p>
                                    <p className="text-sm text-slate-500 pl-6">{selectedHospital.address}</p>
                                </div>
                                
                                {/* Date Selection */}
                                <div>
                                    <label className="font-semibold block mb-2">Select Date:</label>
                                    <input 
                                        type="date" 
                                        value={selectedDate.toISOString().split('T')[0]}
                                        onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                        className="w-full p-2 border rounded-md"
                                    />
                                    {!availableDays.includes(getDayOfWeek(selectedDate)) && (
                                        <p className="text-sm text-amber-600 mt-1">Doctor is not available on this day. Available on: {availableDays.map(d => dayMap[d]).join(', ')}</p>
                                    )}
                                </div>

                                {/* Time Slot Selection */}
                                {scheduleForSelectedDate && (
                                    <div>
                                        <label className="font-semibold block mb-2">Select Time Slot:</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {timeSlots.map(slot => (
                                                <button 
                                                    key={slot}
                                                    onClick={() => setSelectedSlot(slot)}
                                                    className={`p-2 border rounded-md text-sm font-medium ${selectedSlot === slot ? 'bg-indigo-600 text-white' : 'bg-white hover:border-indigo-500'}`}
                                                >
                                                    {slot}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        <button 
                            onClick={handleBooking}
                            disabled={!selectedSlot}
                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-md disabled:bg-slate-300 hover:bg-indigo-700 transition-colors"
                        >
                            Confirm Booking
                        </button>
                    </div>
                )}

                {bookingConfirmed && selectedHospital && (
                     <div className="p-6 text-center space-y-4">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto"/>
                        <h3 className="text-2xl font-bold text-slate-800">Booking Confirmed!</h3>
                        <div className="text-left bg-slate-50 p-4 rounded-lg space-y-2">
                            <p><strong className="w-24 inline-block">Doctor:</strong> {doctor.name}</p>
                            <p><strong className="w-24 inline-block">Specialty:</strong> {doctor.specialization}</p>
                            <p><strong className="w-24 inline-block">Hospital:</strong> {selectedHospital.hospital_name}</p>
                            <p><strong className="w-24 inline-block">Date:</strong> {selectedDate.toLocaleDateString()}</p>
                            <p><strong className="w-24 inline-block">Time:</strong> {selectedSlot}</p>
                        </div>
                        <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 text-left flex items-start gap-3">
                            <Info size={24} className="flex-shrink-0 mt-1"/>
                            <p className="text-sm">{getTravelSuggestion()}</p>
                        </div>
                        <button onClick={onClose} className="w-full bg-slate-600 text-white font-bold py-3 rounded-md hover:bg-slate-700 transition-colors">
                            Close
                        </button>
                     </div>
                )}
            </div>
        </div>
    );
};

export default DoctorBookingModal;