

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import RoutingMachine from '../map/RoutingMachine';
import L from 'leaflet';

// Fix for default markers in react-leaflet
import markerIconPng from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const hospitalIcon = new L.Icon({
  iconUrl: markerIconPng,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const userIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzQyODVmNCIgd2lkdGg9IjI0cHgiIGhlaWdodD0iMjRweCI+PHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDljMCA1LjI1IDcgMTMgNyAxM3M3LTcuNzUgNy0xM2MwLTMuODctMy4xMy03LTctN3ptMCA5LjVjLTEuMzggMC0yLjUtMS4xMi0yLjUtMi41czEuMTItMi41IDIuNS0yLjUgMi41IDEuMTIgMi41IDIuNXMtMS4xMiAyLjUtMi41IDIuNXoiLz48L3N2Zz4=',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
});


// Helper component to recenter the map
function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

function MapView({ hospitals, userLocation, hospital,onMarkerClick }) {
  const defaultCenter = [22.34, 87.31]; // Kharagpur
  const mapCenter = userLocation || defaultCenter;
  
  // When a single hospital is selected, center the view on it
  const viewCenter = hospital ? [hospital.lat, hospital.lon] : mapCenter;

  const renderPopup = (h) => (
    <div>
        <strong className="text-base">{h.hospital_name || h.name}</strong><br />
        {h.address}<br />
        <hr className="my-1"/>
        <strong>Distance:</strong> {(h.route_distance_meters / 1000).toFixed(2)} km (by road)<br/>
        <strong>Est. Time:</strong> {Math.round(h.travel_time_minutes)} min drive
    </div>
  );

  return (
    <MapContainer
      key={viewCenter.toString()}
      center={viewCenter}
      zoom={hospital ? 14 : 12}
      style={{ height: '100%', width: '100%' }}
    >
      <ChangeView center={viewCenter} zoom={hospital ? 14 : 12} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Marker for User's Location */}
      {userLocation && (
        <Marker position={userLocation} icon={userIcon}>
          <Popup><strong>Your Location</strong></Popup>
        </Marker>
      )}

      {/* If a single hospital is selected, show it and the route */}
      {hospital && userLocation && (
        <>
          <Marker 
            position={[hospital.lat, hospital.lon]} 
            icon={hospitalIcon}
          >
            <Popup>{renderPopup(hospital)}</Popup>
          </Marker>
          <RoutingMachine 
            start={userLocation} 
            end={[hospital.lat, hospital.lon]} 
          />
        </>
      )}

      {/* If in list view, show all hospitals from search results */}
      {!hospital && hospitals && hospitals.map(h => {
        // Ensure the hospital object has valid coordinates before rendering
        if (h.lat == null || h.lon == null) {
          console.warn('Skipping hospital with invalid coordinates:', h);
          return null;
        }
        const position = [h.lat, h.lon];
        return (
          <Marker
                        key={h.hospital_id}
                        position={position}
                        icon={hospitalIcon}
                        // Add event handler here
                        eventHandlers={{
                            click: () => {
                                onMarkerClick(h.hospital_id);
                            },
                        }}
                    >
                        <Popup>{renderPopup(h)}</Popup>
                    </Marker>
        );
      })}
    </MapContainer>
  );
}

export default MapView;