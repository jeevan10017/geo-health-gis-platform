// src/services/apiService.js

import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/**
 * @description NEW: Performs an advanced search for available doctors/hospitals.
 * @param {object} params - An object containing lat, lon, and other optional filters.
 * e.g., { lat: 22.3, lon: 87.3, q: 'cardiology', date: '2025-09-14' }
 */
export const advancedSearch = async (params) => {
    try {
        // We use the /search endpoint now
        const response = await axios.get(`${API_URL}/search`, { params });
        return response.data;
    } catch (error) {
        console.error('Error during advanced search:', error);
        throw new Error(error.response?.data?.error || 'Failed to perform search.');
    }
};

/**
 * @description MODIFIED: Fetches doctors for a hospital, now with filtering.
 * @param {number} hospitalId - The ID of the hospital.
 * @param {string} date - The selected date ('YYYY-MM-DD').
 * @param {string} query - A search term for doctor name/specialty.
 */
export const getDoctorsForHospital = async (hospitalId, date, query = '') => {
    try {
        const response = await axios.get(`${API_URL}/hospitals/${hospitalId}/doctors`, {
            params: { date, q: query } // Pass date and query as params
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching doctors:', error);
        throw new Error(error.response?.data?.error || 'Failed to fetch doctor details.');
    }
};
