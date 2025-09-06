// DESCRIPTION: Defines the API routes for the application.

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// --- API Endpoints ---

// Route to get all hospitals as a GeoJSON FeatureCollection
// GET /api/hospitals
router.get('/hospitals', healthController.getAllHospitals);

// Route to find the nearest available doctors
// GET /api/doctors/nearest?lat=...&lon=...&specialization=...
router.get('/doctors/nearest', healthController.findNearestDoctors);

module.exports = router;