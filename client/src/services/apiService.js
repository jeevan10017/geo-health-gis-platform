import axios from 'axios';

// Get the API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL;

/**
 * Fetches all hospitals as a GeoJSON object.
 */
export const getAllHospitals = async () => {
  try {
    const response = await axios.get(`${API_URL}/hospitals`);
    return response.data;
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    throw new Error('Could not fetch hospital data.');
  }
};

/**
 * Finds the nearest available doctors.
 * @param {number} lat - User's latitude.
 * @param {number} lon - User's longitude.
 * @param {string} specialization - The doctor specialization to search for.
 */
export const findNearest = async (lat, lon, specialization) => {
  try {
    const response = await axios.get(`${API_URL}/doctors/nearest`, {
      params: { lat, lon, specialization },
    });
    return response.data;
  } catch (error) {
    console.error('Error finding nearest doctors:', error);
    // Provide a user-friendly error message from the server if available
    const errorMessage = error.response?.data?.message || 'Failed to find doctors.';
    throw new Error(errorMessage);
  }
};