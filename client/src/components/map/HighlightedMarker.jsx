import React from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const pulsingIconStyle = `
  @keyframes pulsing {
    0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
    100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
  }
`;

const HighlightedMarker = ({ hospital, onClick }) => {
  const pulsingIcon = new L.DivIcon({
    className: 'leaflet-pulsing-icon',
    html: `<style>${pulsingIconStyle}</style><div class="ring"></div>`,
    iconSize: [20, 20],
  });

  // Prepare the content for the label
const labelContent = `
    <div class="font-sans">
      <div class="font-bold text-base text-slate-800 mb-1">${hospital.hospital_name}</div>
      <div class="text-sm text-slate-600 space-y-0.5">
        <div>~ ${hospital.travel_time_minutes} min drive</div>
        <div>(${(hospital.route_distance_meters / 1000).toFixed(1)} km)</div>
      </div>
      <div class="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200 space-y-0.5">
        ${hospital.matching_doctors.map(name => `<div>- ${name}</div>`).join('')}
      </div>
    </div>
  `;

  return (
    <Marker 
      position={[hospital.lat, hospital.lon]} 
      icon={pulsingIcon}
      eventHandlers={{
        click: () => {
          onClick(hospital.hospital_id);
        },
      }}
    >
      <Tooltip
        permanent
        direction="bottom"
        offset={[0, 10]}
        className="highlighted-label" 
      >
        <div dangerouslySetInnerHTML={{ __html: labelContent }} />
      </Tooltip>
    </Marker>
  );
};

export default HighlightedMarker;