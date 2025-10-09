import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const handleApiError = (error, defaultMessage) => {
    console.error(`API Error: ${defaultMessage}`, error);
    throw new Error(error.response?.data?.error || defaultMessage);
};

export const getInitialHospitals = async (lat, lon) => {
    try {
        const response = await axios.get(`${API_URL}/initial-hospitals`, { params: { lat, lon } });
        return response.data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch nearby hospitals.');
    }
};

export const fetchAutocompleteSuggestions = async (query, lat, lon) => {
    if (!query) return [];
    try {
        const response = await axios.get(`${API_URL}/autocomplete`, { params: { q: query, lat, lon } });
        return response.data;
    } catch (error) {
        // Fail silently for autocomplete
        console.error('Autocomplete fetch failed:', error);
        return [];
    }
};

export const searchBySpecialty = async (specialty, lat, lon, date) => {
    try {
        const params = { q: specialty, lat, lon, date };
        // Remove empty params
        Object.keys(params).forEach(key => !params[key] && delete params[key]);
        const response = await axios.get(`${API_URL}/search`, { params });
        return response.data;
    } catch (error) {
        handleApiError(error, 'Failed to perform specialty search.');
    }
};

export const getHospitalDetails = async (hospitalId) => {
    try {
        const response = await axios.get(`${API_URL}/hospitals/${hospitalId}`);
        return response.data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch hospital details.');
    }
};

export const getDoctorsForHospital = async (hospitalId, date, query = '') => {
    try {
        const response = await axios.get(`${API_URL}/hospitals/${hospitalId}/doctors`, {
            params: { date, q: query }
        });
        return response.data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch doctors.');
    }
};

export const getDoctorDetails = async (doctorId, lat, lon) => {
    try {
        const response = await axios.get(`${API_URL}/doctors/${doctorId}`, { params: { lat, lon } });
        return response.data;
    } catch (error) {
        handleApiError(error, 'Failed to fetch doctor details.');
    }
};