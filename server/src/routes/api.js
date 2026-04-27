
const express  = require('express');
const router   = express.Router();

const health   = require('../controllers/healthController');
const decision = require('../controllers/decisionController');
const debug    = require('../controllers/debugController');


const sms      = require('../controllers/smsController');

const analytics = require('../controllers/analyticsController');

const prob      = require('../controllers/probabilisticController');

const ch       = require('../controllers/chController');

// ─── healthController ────────────────────────────────────────────────────────

router.get('/hospitals/currently-available', health.getCurrentlyAvailable);
router.get('/hospitals',                 health.getInitialHospitals);
router.get('/hospitals/:id',             health.getHospitalById);
router.get('/hospitals/:id/doctors',     health.getDoctorsByHospital);
router.get('/pareto-hospitals',          health.getParetoHospitals);
router.get('/autocomplete',              health.getAutocompleteSuggestions);
router.get('/search',                    health.unifiedSearch);
router.get('/search/advanced',           health.advancedSearch);
router.get('/doctors/:id',               health.getDoctorById);
router.get('/route',                     health.getRoute);
router.get('/route/ors',                 health.getOrsRoute);
router.get('/route/ch',                  ch.getChRoute);

// ─── Contraction Hierarchies ──────────────────────────────────────────────────

router.get('/ch/status',                 ch.getChStatus);
router.get('/ch/graph-export',           ch.exportChGraph);


// ─── decisionController ───────────────────────────────────────────────────────

router.get('/decision-mode',             decision.getHospitalsByDecisionMode);
router.get('/emergency-hospitals',       decision.getEmergencyHospitals);
router.post('/compare-hospitals',        decision.compareHospitals);
router.get('/tradeoff-data',             decision.getTradeoffData);
router.get('/hospital-load',             decision.getHospitalLoadStatus);


// ─── Debug (remove or gate with env check before going to production) ─────────

router.get('/debug/network-check',       debug.networkCheck);
router.get('/debug/db-test',             debug.dbTest);
router.get('/debug/ors-test',            debug.orsTest);

// ─── Probabilistic + Multi-Agent ─────────────────────────────────────────────

router.post('/probabilistic/route',          prob.probabilisticRoute);
router.post('/agents/coordinate',            prob.coordinateAgents);
router.get('/agents/ambulances',             prob.getAmbulances);


// ─── Analytics ────────────────────────────────────────────────────────────────

router.get('/analytics/blackspots',          analytics.getBlackspots);
router.get('/analytics/ambulance-placement', analytics.getAmbulancePlacements);
router.post('/analytics/survival-score',     analytics.getSurvivalScore);
router.post('/analytics/voice-query',        analytics.voiceQuery);
router.post('/analytics/probabilistic-score', analytics.getProbabilisticScore);
router.post('/analytics/multi-agent-assign', analytics.multiAgentAssign);


// ─── SMS ──────────────────────────────────────────────────────────────────────

router.post('/sms-webhook',              sms.handleSmsWebhook);
router.get('/sms-webhook',               sms.handleSmsWebhook);
router.get('/sms-test',                  sms.testSms);
router.post('/sms/send',                 sms.sendSmsQuery);


module.exports = router;