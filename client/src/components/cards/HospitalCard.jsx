import React from 'react';
import { Car, MapPin } from 'lucide-react'; // Assuming lucide has UserMd or similar

const HospitalCard = ({ hospital, onClick }) => (
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
        {hospital.doctor_count && (
             <p className="text-xs text-slate-500 mt-2">
                <span className="font-semibold text-green-600">{hospital.doctor_count}</span> doctors available
            </p>
        )}
    </div>
);

export default HospitalCard;