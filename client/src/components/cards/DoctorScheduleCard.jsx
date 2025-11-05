import React from 'react';

const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

const DoctorScheduleCard = ({ doctor, onBook }) => (
    <div className="p-4 bg-slate-50 border rounded-lg">
        <div className="flex justify-between items-start">
            {/* Doctor Info */}
            <div>
                <p className="font-semibold text-slate-900">{doctor.name}</p>
                <p className="text-sm text-slate-600">{doctor.specialization}</p>
            </div>
            {/* Book Button */}
            <button
                onClick={() => onBook(doctor.doctor_id)}
                className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0"
            >
                Book
            </button>
        </div>
        
        {/* Full Schedule Display */}
        <div className="mt-3 pt-3 border-t">
            <h4 className="text-xs font-semibold text-slate-500 mb-2">Weekly Schedule</h4>
            <div className="flex flex-wrap gap-2">
                {doctor.all_schedules.map(schedule => (
                    <div key={schedule.day_of_week} className="flex items-center gap-2 bg-slate-200 rounded-md px-2 py-1">
                        <span className="text-xs font-bold text-slate-700">{dayMap[schedule.day_of_week]}</span>
                        <span className="text-xs text-indigo-700 font-medium">
                            {schedule.start_time} - {schedule.end_time}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export default DoctorScheduleCard;