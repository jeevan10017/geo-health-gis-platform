// src/components/cards/DoctorCard.jsx

import React, { useMemo } from 'react';
import { Play } from 'lucide-react';

const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

// Add `hospital` and `onStartNavigation` props back in
const DoctorCard = ({ doctor, hospital, onBook, onStartNavigation }) => {

    // Logic for the "Start" button
    const { isAvailableNow, availabilityText } = useMemo(() => {
        if (!hospital) return { isAvailableNow: false }; // Guard against missing prop

        const now = new Date();
        const currentDay = now.getDay() === 0 ? 7 : now.getDay();
        
        // Check if the doctor's schedule for today (from `available_days`) matches the current day
        const scheduleToday = doctor.available_days?.includes(currentDay);
        if (!scheduleToday) return { isAvailableNow: false };

        const startTime = new Date(`1970-01-01T${doctor.start_time}`);
        const endTime = new Date(`1970-01-01T${doctor.end_time}`);
        const nowTime = new Date(`1970-01-01T${now.toTimeString().slice(0, 8)}`);
        
        if (nowTime >= startTime && nowTime < endTime) {
            const arrivalTime = new Date(now.getTime() + hospital.travel_time_minutes * 60000);
            return {
                isAvailableNow: true,
                availabilityText: `Available until ${doctor.end_time}. Reach by ~${arrivalTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`
            };
        }
        return { isAvailableNow: false };
    }, [doctor, hospital]);

    return (
        <div className="p-4 bg-slate-50 border rounded-lg">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-slate-900">{doctor.name}</p>
                    <p className="text-sm text-slate-600">{doctor.specialization}</p>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-indigo-700 font-medium">
                            {doctor.start_time} - {doctor.end_time}
                        </span>
                        <div className="flex gap-1">
                            {doctor.available_days?.sort().map(day => (
                                <span key={day} className="text-xs bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded-sm">
                                    {dayMap[day]}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <button
                    // --- THIS IS THE FIX ---
                    // Was: onClick={() => onBook(doctor)}
                    // Now:
                    onClick={() => onBook(doctor.doctor_id)}
                    // -----------------------
                    className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0"
                >
                    Book
                </button>
            </div>

            {/* "Start" button logic, which you had before */}
            {isAvailableNow && (
                <div className="mt-3 pt-3 border-t flex items-center justify-between gap-4">
                    <p className="text-sm text-green-700 font-medium">{availabilityText}</p>
                    <button
                        onClick={() => onStartNavigation(hospital.hospital_id)}
                        className="flex items-center gap-2 bg-green-600 text-white font-bold px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                    >
                        <Play size={16} /> Start
                    </button>
                </div>
            )}
        </div>
    );
};

export default DoctorCard;