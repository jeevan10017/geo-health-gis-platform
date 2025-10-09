const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// Autocomplete and initial data routes
router.get('/autocomplete', healthController.getAutocompleteSuggestions);
router.get('/initial-hospitals', healthController.getInitialHospitals);

// Search and detailed data routes
router.get('/search', healthController.advancedSearch); // Kept for specialty/keyword search
router.get('/hospitals/:id', healthController.getHospitalById);
router.get('/hospitals/:id/doctors', healthController.getDoctorsByHospital);
router.get('/doctors/:id', healthController.getDoctorById);

// Legacy route (optional, can be removed)
// router.get('/hospitals', healthController.searchHospitals);

module.exports = router;