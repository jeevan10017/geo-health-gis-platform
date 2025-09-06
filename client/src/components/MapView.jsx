import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

// A helper component to recenter the map when the user's location is found.
function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

function MapView({ hospitals, userLocation }) {
  // Default center is Kharagpur, West Bengal
  const defaultCenter = [22.34, 87.31];
  const mapCenter = userLocation || defaultCenter;

  return (
    <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
      {/* Change the view if the user location is updated */}
      {userLocation && <ChangeView center={userLocation} zoom={13} />}

      {/* Base map layer from OpenStreetMap */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Marker for the user's location */}
      {userLocation && (
        <Marker position={userLocation}>
          <Popup>Your Location</Popup>
        </Marker>
      )}

      {/* Markers for all hospitals */}
      {hospitals && hospitals.features.map(hospital => {
        const { coordinates } = hospital.geometry;
        const { name, address, hospital_id } = hospital.properties;
        // Leaflet expects [lat, lon], but GeoJSON is [lon, lat]
        const position = [coordinates[1], coordinates[0]];
        return (
          <Marker key={hospital_id} position={position}>
            <Popup>
              <strong>{name}</strong><br />
              {address}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default MapView;