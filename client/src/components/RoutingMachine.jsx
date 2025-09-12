import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { useMap } from 'react-leaflet';

const RoutingMachine = ({ start, end }) => {
    const map = useMap();

    useEffect(() => {
        if (!map || !start || !end) return;

        const routingControl = L.Routing.control({
            waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
            routeWhileDragging: true,
            lineOptions: {
                styles: [{ color: '#6FA1EC', weight: 4 }],
            },
            show: false, // Hide the turn-by-turn instructions panel
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
        }).addTo(map);

        return () => map.removeControl(routingControl);
    }, [map, start, end]);

    return null;
};

export default RoutingMachine;