import React, { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import RoutingMachine from '../map/RoutingMachine';
import { X, Navigation } from 'lucide-react';

const NavigationView = ({ userLocation, hospital, onClose }) => {
    const [routeInfo, setRouteInfo] = useState(null);

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col md:flex-row-reverse">
            <div className="w-full md:w-96 bg-white shadow-lg z-10 p-4 flex flex-col h-1/2 md:h-full">
                <div className="flex-shrink-0 flex justify-between items-center border-b pb-3 mb-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Navigating to</h2>
                        <p className="text-slate-600">{hospital.hospital_name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
                        <X size={24} />
                    </button>
                </div>
                
                {routeInfo && (
                    <div className="bg-indigo-50 p-3 rounded-lg mb-4 flex-shrink-0">
                        <p className="text-lg font-bold text-indigo-700">{Math.round(routeInfo.summary.totalTime / 60)} min</p>
                        <p className="text-slate-600">({(routeInfo.summary.totalDistance / 1000).toFixed(1)} km)</p>
                    </div>
                )}

                <div className="flex-grow overflow-y-auto">
                    <ul className="space-y-2">
                        {routeInfo?.instructions.map((step, index) => (
                            <li key={index} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                                <Navigation size={20} className="text-slate-500 mt-1 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-slate-800">{step.text}</p>
                                    <p className="text-sm text-slate-500">{step.distance} m</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* --- Fullscreen Map --- */}
            <div className="flex-grow h-1/2 md:h-full">
                <MapContainer center={userLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <RoutingMachine
                        start={userLocation}
                        end={[hospital.lat, hospital.lon]}
                        onRouteFound={setRouteInfo} // Capture route details
                    />
                </MapContainer>
            </div>
        </div>
    );
};

export default NavigationView;