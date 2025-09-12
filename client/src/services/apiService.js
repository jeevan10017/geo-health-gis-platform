
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/**
 * Searches for hospitals based on user location and an optional query.
 * @param {number} lat - User's latitude.
 * @param {number} lon - User's longitude.
 * @param {string} query - Search term (hospital, doctor, specialization).
 */
export const searchHospitals = async (lat, lon, query = '') => {
    try {
        const response = await axios.get(`${API_URL}/hospitals`, {
            params: { lat, lon, q: query },
        });
        return response.data;
    } catch (error) {
        console.error('Error searching hospitals:', error);
        throw new Error(error.response?.data?.error || 'Failed to find hospitals.');
    }
};

/**
 * Fetches the available doctors for a specific hospital.
 * @param {number} hospitalId - The ID of the hospital.
 */
export const getDoctorsForHospital = async (hospitalId) => {
    try {
        const response = await axios.get(`${API_URL}/hospitals/${hospitalId}/doctors`);
        return response.data;
    } catch (error) {
        console.error('Error fetching doctors:', error);
        throw new Error(error.response?.data?.error || 'Failed to fetch doctor details.');
    }
};
