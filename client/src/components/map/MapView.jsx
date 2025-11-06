import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, GeoJSON, Circle } from 'react-leaflet';
import L from 'leaflet';
import RoutingMachine from './RoutingMachine';
import HighlightedMarker from './HighlightedMarker';
import { getRouteGeometry } from '../../services/apiService';
import { Database, MapPin } from 'lucide-react'; // Import icons

// --- Custom Icons (No Changes) ---
const userIcon = new L.DivIcon({
    html: `<div class="w-full h-full bg-blue-500 rounded-full border-2 border-white shadow-md"></div>`,
    className: 'leaflet-user-icon',
    iconSize: [16, 16],
});

const hospitalIconSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50,0 C22.4,0 0,22.4 0,50 C0,77.6 50,100 50,100 C50,100 100,77.6 100,50 C100,22.4 77.6,0 50,0 Z" fill="#dc2626"/><path d="M50,25 L50,75 M25,50 L75,50" stroke="white" stroke-width="12" stroke-linecap="round"/></svg>`;
const hospitalIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(hospitalIconSvg)}`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
});

// --- Smart Map View Controller (Updated) ---
// We add routingMode to the dependency array
function MapViewController({ hospitals, selectedHospital, userLocation, routingMode }) {
  const map = useMap();

  useEffect(() => {
    // If a hospital is selected, let the routing layers (OSRM/pgRouting) handle the zoom
    if (selectedHospital) {
      return; 
    }
    
    // If we are on the main list view, fit all results
    if (hospitals && hospitals.length > 0) {
      const bounds = L.latLngBounds(hospitals.map(h => [h.lat, h.lon]));
      if (userLocation) {
        bounds.extend(userLocation);
      }
      map.fitBounds(bounds, { padding: [50, 50] });
    }

  }, [hospitals, selectedHospital, userLocation, routingMode, map]); 

  return null;
}


// --- PgRoutingLayer (No Changes) ---
const PgRoutingLayer = ({ userLocation, hospital }) => {

    const [routeGeoJSON, setRouteGeoJSON] = useState(null);
    const map = useMap();
    useEffect(() => {
        if (!userLocation || !hospital) {
            setRouteGeoJSON(null);
            return;
        }
        let isMounted = true;
        getRouteGeometry(userLocation[0], userLocation[1], hospital.lat, hospital.lon)
            .then(data => {
                if (isMounted && data) { // Check if data is not null
                    setRouteGeoJSON(data);
                    const bounds = L.geoJSON(data).getBounds();
                    // Check if bounds are valid before fitting
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [50, 50] });
                    }
                }
            })
            .catch(err => {
                console.error("Could not fetch pgRouting route:", err);
                if (isMounted) setRouteGeoJSON(null);
            });
        return () => { isMounted = false; };
    }, [userLocation, hospital, map]);
    if (!routeGeoJSON) return null;
    return (
        <GeoJSON 
            data={routeGeoJSON} 
            style={{ color: '#ec4899', weight: 6, opacity: 0.8 }} 
        />
    );
};

function RoutingToggleControl({ routingMode, setRoutingMode }) {
  const map = useMap();

  useEffect(() => {
    const control = L.control({ position: 'bottomright' });
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    
    container.style.backgroundColor = 'white';
    container.style.padding = '8px 20px'; 
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
    container.style.cursor = 'pointer';

    container.style.marginBottom = '3rem'; 
    
    const updateContent = (mode) => {
      const mapPinIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
      const dbIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
      
      const icon = mode === 'osrm' ? mapPinIcon : dbIcon;
      // Using inline styles for the flex container
      container.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;" class="text-sm font-semibold text-slate-700" title="${mode === 'osrm' ? 'Frontend Routing (OSRM)' : 'Backend Routing (pgRouting)'}">
        ${icon}
        <span>${mode === 'osrm' ? 'OSRM' : 'pgRouting'}</span>
      </div>`;
    };
    
    updateContent(routingMode);

    L.DomEvent.on(container, 'click', (e) => {
      e.stopPropagation();
      setRoutingMode(currentMode => {
        const newMode = currentMode === 'osrm' ? 'pgrouting' : 'osrm';
        updateContent(newMode);
        return newMode;
      });
    });

    L.DomEvent.disableClickPropagation(container);
    control.onAdd = () => container;
    map.addControl(control);
    
    return () => {
      map.removeControl(control);
    };
  }, [map, routingMode, setRoutingMode]);

  return null;
}

function MapView({ userLocation, hospitals, hospital, onMarkerClick, searchType, radiusKm, routingMode, setRoutingMode }) {
  const isSpecialtySearch = searchType === 'specialty';

  const renderPopup = (h) => (
    <div>
        <strong className="text-base">{h.hospital_name || h.name}</strong><br />
        {h.address}<br />
        <hr className="my-1"/>
        <strong>Est. Time:</strong> {Math.round(h.travel_time_minutes)} min drive<br/>
        <strong>Distance:</strong> {(h.route_distance_meters / 1000).toFixed(1)} km
    </div>
  );

  return (
    <MapContainer
      center={userLocation || [22.34, 87.31]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      
      <MapViewController 
        hospitals={hospitals} 
        selectedHospital={hospital}
        userLocation={userLocation}
        routingMode={routingMode} // Pass this down
      />

      <RoutingToggleControl routingMode={routingMode} setRoutingMode={setRoutingMode} />

      {userLocation && (
        <Marker position={userLocation} icon={userIcon}>
          <Popup><strong>Your Location</strong></Popup>
        </Marker>
      )}

      {/* --- GEOFENCE CIRCLE (FIXED) --- */}
      {radiusKm && userLocation && (
        <Circle
            center={userLocation}
            radius={parseFloat(radiusKm) * 1000}
            pathOptions={{ 
                color: '#3b82f6',
                fillColor: '#bfdbfe',
                fillOpacity: 0.1,
                dashArray: '5, 10',
                weight: 2
            }}
        />
      )}

      {/* --- Marker Rendering Logic (No Changes) --- */}
      {hospitals.map(h => {
        if (isSpecialtySearch && h.matching_doctors) {
          return <HighlightedMarker key={`highlight-${h.hospital_id}`} hospital={h} onClick={onMarkerClick} />;
        } 
        else if (!hospital) {
           return (
            <Marker
              key={h.hospital_id}
              position={[h.lat, h.lon]}
              icon={hospitalIcon}
              eventHandlers={{ click: () => onMarkerClick(h.hospital_id) }}
            >
              <Tooltip permanent direction="top" offset={[0, -32]} className="hospital-label">
                <div>
                  <div className="font-bold">{h.hospital_name}</div>
                  <div className="text-xs">~{Math.round(h.travel_time_minutes)} min / {(h.route_distance_meters / 1000).toFixed(1)} km</div>
                </div>
              </Tooltip>
            </Marker>
           )
        }
        return null;
      })}
      
      {/* --- UPDATED ROUTING BLOCK --- */}
      {hospital && userLocation && (
        <>
          <Marker position={[hospital.lat, hospital.lon]} icon={hospitalIcon}>
            <Tooltip permanent direction="top" offset={[0, -32]} className="hospital-label">
              <div>
                <div className="font-bold">{hospital.hospital_name}</div>
                <div className="text-xs">~{Math.round(hospital.travel_time_minutes)} min / {(hospital.route_distance_meters / 1000).toFixed(1)} km</div>
              </div>
            </Tooltip>
            <Popup>{renderPopup(hospital)}</Popup>
          </Marker>
          
          {/* --- CONDITIONAL ROUTING LAYER --- */}
          {routingMode === 'osrm' ? (
            <RoutingMachine start={userLocation} end={[hospital.lat, hospital.lon]} />
          ) : (
            <PgRoutingLayer userLocation={userLocation} hospital={hospital} />
          )}
        </>
      )}
    </MapContainer>
  );
}

export default MapView;