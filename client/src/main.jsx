import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';

createRoot(document.getElementById('root')).render(
//  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
);
