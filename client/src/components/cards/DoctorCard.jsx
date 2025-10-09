import React from 'react';

const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

const DoctorCard = ({ doctor, onBook }) => (
    <div className="p-4 bg-slate-50 border rounded-lg flex justify-between items-center">
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
            onClick={() => onBook(doctor)}
            className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
        >
            Book
        </button>
    </div>
);

export default DoctorCard;