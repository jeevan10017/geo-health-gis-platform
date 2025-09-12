import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import RoutingMachine from './RoutingMachine';
import L from 'leaflet';

// Fix for default markers in react-leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Create custom icons for different markers
const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMzQjgyRjYiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIgZmlsbD0id2hpdGUiLz4KPC9zdmc+',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const hospitalIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjREMyNjI2Ii8+CjxwYXRoIGQ9Ik0xMiA2VjE4TTE4IDEySDZaIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4=',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// A helper component to recenter the map when the user's location is found.
function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

function MapView({ hospitals, userLocation, hospital }) {
  // Default center is Kharagpur, West Bengal
  const defaultCenter = [22.34, 87.31];
  const mapCenter = userLocation || defaultCenter;

  // For single hospital view, center on the hospital
  const viewCenter = hospital ? [hospital.lat, hospital.lon] : mapCenter;

  return (
    <MapContainer
      key={viewCenter.toString()} // Force re-render when center changes
      center={viewCenter}
      zoom={hospital ? 15 : 12} // Zoom closer for single hospital view
      style={{ height: '100%', width: '100%' }}
    >
      <ChangeView center={viewCenter} zoom={hospital ? 15 : 12} />

      {/* Base map layer from OpenStreetMap */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Marker for the user's location */}
      {userLocation && (
        <Marker position={userLocation} icon={userIcon}>
          <Popup>
            <div className="text-center">
              <strong>Your Location</strong>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Single hospital view with routing */}
      {hospital && userLocation && (
        <>
          <Marker 
            position={[hospital.lat, hospital.lon]} 
            icon={hospitalIcon}
          >
            <Popup>
              <div>
                <strong>{hospital.name}</strong><br />
                {hospital.address}<br />
                {hospital.phone && (
                  <>
                    <strong>Phone:</strong> {hospital.phone}<br />
                  </>
                )}
                <strong>Distance:</strong> {(hospital.distance_in_meters / 1000).toFixed(2)} km
              </div>
            </Popup>
          </Marker>
          {/* Add routing between user location and hospital */}
          <RoutingMachine 
            start={userLocation} 
            end={[hospital.lat, hospital.lon]} 
          />
        </>
      )}

      {/* Multiple hospitals view (list view) */}
      {hospitals && !hospital && hospitals.map && hospitals.map(h => {
        const position = [h.lat, h.lon];
        return (
          <Marker key={h.hospital_id} position={position} icon={hospitalIcon}>
            <Popup>
              <div>
                <strong>{h.name}</strong><br />
                {h.address}<br />
                {h.phone && (
                  <>
                    <strong>Phone:</strong> {h.phone}<br />
                  </>
                )}
                <strong>Distance:</strong> {(h.distance_in_meters / 1000).toFixed(2)} km
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Handle GeoJSON format if hospitals is a feature collection */}
      {hospitals && hospitals.features && hospitals.features.map(hospitalFeature => {
        const { coordinates } = hospitalFeature.geometry;
        const { name, address, hospital_id, phone } = hospitalFeature.properties;
        // Leaflet expects [lat, lon], but GeoJSON is [lon, lat]
        const position = [coordinates[1], coordinates[0]];
        return (
          <Marker key={hospital_id} position={position} icon={hospitalIcon}>
            <Popup>
              <div>
                <strong>{name}</strong><br />
                {address}<br />
                {phone && (
                  <>
                    <strong>Phone:</strong> {phone}
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default MapView;