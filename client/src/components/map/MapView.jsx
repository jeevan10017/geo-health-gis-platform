import React, { useEffect } from 'react';

import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, Circle } from 'react-leaflet';

import L from 'leaflet';

import RoutingMachine from './RoutingMachine';

import HighlightedMarker from './HighlightedMarker';



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

function MapViewController({ hospitals, selectedHospital, userLocation }) {

  const map = useMap();



  useEffect(() => {

    // --- FIX STARTS HERE ---

    // Priority 1: A single hospital is selected for routing. Fit both user and hospital in view.

    if (selectedHospital && userLocation) {

      // Create bounds that include both the user's location and the hospital's location.

      const routeBounds = L.latLngBounds([

        userLocation, 

        [selectedHospital.lat, selectedHospital.lon]

      ]);

      // Fit the map to these bounds to show the entire route.

      map.fitBounds(routeBounds, { padding: [50, 50] });

    } 

    // --- FIX ENDS HERE ---



    // Priority 2: There are search results (but none selected), fit them all in the view.

    else if (hospitals && hospitals.length > 0) {

      const bounds = L.latLngBounds(hospitals.map(h => [h.lat, h.lon]));

      if (userLocation) {

        bounds.extend(userLocation);

      }

      map.fitBounds(bounds, { padding: [50, 50] });

    }

  }, [hospitals, selectedHospital, userLocation, map]);



  return null;

}





// --- Main MapView Component (No other changes needed) ---

function MapView({ userLocation, hospitals, hospital, onMarkerClick, searchType, radiusKm }) {

  const isSpecialtySearch = searchType === 'specialty';



  const renderPopup = (h) => (

    <div>

        <strong className="text-base">{h.hospital_name || h.name}</strong><br />

        {h.address}<br />

        <hr className="my-1"/>

        <strong>Est. Time:</strong> {Math.round(h.travel_time_minutes)} min drive

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

      />



      {userLocation && (

        <Marker position={userLocation} icon={userIcon}>

          <Popup><strong>Your Location</strong></Popup>

        </Marker>

      )}



      {/* --- NEW GEOFENCE CIRCLE --- */}

      {/* If a radius is selected (is not an empty string) and we have a user location, draw the circle */}

      {radiusKm && userLocation && (

        <Circle

            center={userLocation}

            radius={parseFloat(radiusKm) * 1000} // Convert km to meters

            pathOptions={{ 

                color: '#3b82f6',

                fillColor: '#bfdbfe',

                fillOpacity: 0.1,

                dashArray: '5, 10', // Dotted line

                weight: 2

            }}

        />

      )}

      {/* --- END NEW CIRCLE --- */}





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

                {h.hospital_name}

              </Tooltip>

            </Marker>

           )

        }

        return null;
 })}

      

      {hospital && userLocation && (

        <>

          <Marker position={[hospital.lat, hospital.lon]} icon={hospitalIcon}>

            <Tooltip permanent direction="top" offset={[0, -32]} className="hospital-label">

              {hospital.hospital_name}

            </Tooltip>

            <Popup>{renderPopup(hospital)}</Popup>

          </Marker>

          <RoutingMachine 

            start={userLocation} 

            end={[hospital.lat, hospital.lon]} 

          />

        </>

      )}

    </MapContainer>

  );

}



export default MapView;