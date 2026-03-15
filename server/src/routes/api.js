
const express  = require('express');
const router   = express.Router();

const health   = require('../controllers/healthController');
const decision = require('../controllers/decisionController');
const debug    = require('../controllers/debugController');


// ─── healthController ────────────────────────────────────────────────────────

router.get('/hospitals',                 health.getInitialHospitals);
router.get('/hospitals/:id',             health.getHospitalById);
router.get('/hospitals/:id/doctors',     health.getDoctorsByHospital);
router.get('/pareto-hospitals',          health.getParetoHospitals);
router.get('/autocomplete',              health.getAutocompleteSuggestions);
router.get('/search',                    health.unifiedSearch);
router.get('/search/advanced',           health.advancedSearch);
router.get('/doctors/:id',               health.getDoctorById);
router.get('/route',                     health.getRoute);


// ─── decisionController ───────────────────────────────────────────────────────

router.get('/decision-mode',             decision.getHospitalsByDecisionMode);
router.get('/emergency-hospitals',       decision.getEmergencyHospitals);
router.post('/compare-hospitals',        decision.compareHospitals);
router.get('/tradeoff-data',             decision.getTradeoffData);
router.get('/hospital-load',             decision.getHospitalLoadStatus);


// ─── Debug (remove or gate with env check before going to production) ─────────

router.get('/debug/network-check',       debug.networkCheck);


module.exports = router;