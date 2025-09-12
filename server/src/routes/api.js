const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');


router.get('/hospitals', healthController.searchHospitals);

router.get('/hospitals/:id/doctors', healthController.getDoctorsByHospital);


module.exports = router;