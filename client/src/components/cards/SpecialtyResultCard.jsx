import React from 'react';
import { Car, MapPin, User } from 'lucide-react';

const SpecialtyResultCard = ({ hospital, onClick }) => (
    <div
        onClick={() => onClick(hospital.hospital_id)}
        className="p-4 bg-white border rounded-lg shadow-sm hover:shadow-md hover:border-indigo-500 cursor-pointer transition-all duration-200"
    >
        <h3 className="font-bold text-lg text-slate-800">{hospital.hospital_name}</h3>
        <p className="text-sm text-slate-600 mt-1 line-clamp-1 flex items-center gap-1">
            <MapPin size={14} /> {hospital.address}
        </p>
        <div className="flex justify-between items-center mt-3 text-sm">
            <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                <Car size={16} />
                <span>~ {hospital.travel_time_minutes} min</span>
            </div>
            <div className="text-slate-500 font-medium">
                {(hospital.route_distance_meters / 1000).toFixed(1)} km
            </div>
        </div>
        {hospital.matching_doctors && hospital.matching_doctors.length > 0 && (
             <div className="mt-3 pt-2 border-t">
                 <h4 className="text-xs font-semibold text-slate-500 mb-1">Available Doctors:</h4>
                 <div className="flex flex-wrap gap-x-2 text-xs text-slate-700">
                    {hospital.matching_doctors.map(doc => (
                        <span key={doc.name} className="flex items-center gap-1"><User size={12}/> {doc.name}</span>
                    ))}
                 </div>
            </div>
        )}
    </div>
);

export default SpecialtyResultCard;