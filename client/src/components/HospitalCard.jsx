import React from 'react';

function HospitalCard({ hospital, onSelect }) {
    return (
        <div className="hospital-card" onClick={() => onSelect(hospital)}>
            <h3>{hospital.name}</h3>
            <p>{hospital.address}</p>
            <p className="distance">
                <strong>Distance:</strong> {(hospital.distance_in_meters / 1000).toFixed(2)} km
            </p>
        </div>
    );
}

export default HospitalCard;