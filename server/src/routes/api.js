const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');


router.get('/autocomplete', healthController.getAutocompleteSuggestions);
router.get('/initial-hospitals', healthController.getInitialHospitals);

router.get('/search', healthController.advancedSearch);
router.get('/hospitals/:id', healthController.getHospitalById);
router.get('/hospitals/:id/doctors', healthController.getDoctorsByHospital);
router.get('/doctors/:id', healthController.getDoctorById);


module.exports = router;