import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { useMap } from 'react-leaflet';

const RoutingMachine = ({ start, end, onRouteFound }) => {
    const map = useMap();

    useEffect(() => {
        if (!map || !start || !end) return;

        const routingControl = L.Routing.control({
            waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
            routeWhileDragging: false,
            // --- Customizations ---
            lineOptions: {
                styles: [{ color: '#ec4899', weight: 6, opacity: 0.8 }], 
            },
            show: false, //  default instructions panel
            addWaypoints: false,
            fitSelectedRoutes: true,
            createMarker: () => null // Hide the default start/end markers
        }).addTo(map);
        
        // --- Callback for instructions ---
        if (onRouteFound) {
            routingControl.on('routesfound', (e) => {
                onRouteFound(e.routes[0]);
            });
        }

        return () => map.removeControl(routingControl);
    }, [map, start, end, onRouteFound]);

    return null;
};

export default RoutingMachine;