// =============================================================================
//  src/controllers/smsController.js
//  SMS-based hospital query system for rural areas.
//
//  Supported commands:
//    CARDIO 22.317 87.300       → nearest cardiology hospitals
//    EMERGENCY 22.317 87.300   → nearest ICU-capable hospitals
//    HOSPITAL 22.317 87.300    → nearest hospitals (any)
//    HELP                      → usage instructions
//    HELP BN                   → instructions in Bengali
//
//  SMS Gateway: Fast2SMS (India, free tier available)
//    Sign up: https://www.fast2sms.com
//    Add API key to .env: FAST2SMS_API_KEY=your_key
// =============================================================================

const db    = require('../db');
const https = require('https');

// ─── Fast2SMS sender ──────────────────────────────────────────────────────────

const RECEIVER_NUMBER = '8500003192';  // ← your demo number — all replies go here

const sendSMS = (toPhone, message) => new Promise((resolve, reject) => {
    const apiKey = process.env.FAST2SMS_API_KEY;
    const targetPhone = toPhone; // Send to the actual phone passed in

    if (!apiKey) {
        console.log(`[SMS] ⚠️  No FAST2SMS_API_KEY in .env. Would send to ${targetPhone}:\n${message}`);
        return resolve({ 
            simulated: true, 
            to: targetPhone,
            message: 'SMS would be sent (no API key configured)',
            full_message: message
        });
    }

    const mobile = targetPhone.replace(/\D/g, '').slice(-10);

    const body = JSON.stringify({
        route:    'q',
        message,
        language: 'english',
        flash:    0,
        numbers:  mobile,
    });

    const options = {
        hostname: 'www.fast2sms.com',
        path:     '/dev/bulkV2',
        method:   'POST',
        headers:  {
            'authorization': apiKey,
            'Content-Type':  'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
    };

    console.log(`[SMS] 📤 Sending to ${targetPhone}...`);

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            try { 
                const result = JSON.parse(data);
                console.log(`[SMS] ✅ API Response:`, result);
                resolve(result); 
            }
            catch { 
                console.log(`[SMS] Raw response:`, data);
                resolve({ raw: data }); 
            }
        });
    });

    req.on('error', (err) => {
        console.error(`[SMS] ❌ Request error:`, err.message);
        reject(err);
    });
    req.on('timeout', () => { 
        console.error(`[SMS] ❌ Request timeout`);
        req.destroy(); 
        reject(new Error('SMS timeout')); 
    });
    req.write(body);
    req.end();
});

// ─── Message parser ───────────────────────────────────────────────────────────

const parseMessage = (raw) => {
    const msg   = (raw || '').trim().toUpperCase();
    const parts = msg.split(/\s+/);

    const cmd   = parts[0];
    const lat   = parseFloat(parts[1]);
    const lon   = parseFloat(parts[2]);

    const hasLocation = !isNaN(lat) && !isNaN(lon) && lat >= 20 && lat <= 28 && lon >= 85 && lon <= 90;

    return { cmd, lat, lon, hasLocation, raw: raw.trim() };
};

// ─── Format response ──────────────────────────────────────────────────────────

const formatHospitals = (hospitals, title) => {
    const lines = [`${title}\n`];
    hospitals.slice(0, 3).forEach((h, i) => {
        const dist = h.route_distance_meters
            ? `${(h.route_distance_meters / 1000).toFixed(1)} km`
            : `${parseFloat(h.distance_km ?? 0).toFixed(1)} km`;
        const time = h.travel_time_minutes
            ? `~${Math.round(h.travel_time_minutes)} min`
            : '';
        lines.push(`${i + 1}. ${h.hospital_name || h.name}`);
        lines.push(`   ${dist}${time ? ' · ' + time : ''}`);
        if (h.hospital_rating) lines.push(`   Rating: ${h.hospital_rating}/5`);
        lines.push('');
    });
    lines.push('Reply HELP for commands');
    return lines.join('\n').trim();
};

const HELP_EN = `GeoHealth SMS Commands:

CARDIO 22.317 87.300
→ Cardiology hospitals near you

EMERGENCY 22.317 87.300
→ ICU/Emergency hospitals

HOSPITAL 22.317 87.300
→ Any hospital nearby

Replace 22.317 87.300 with your GPS coordinates (share from Google Maps)

Reply HELP BN for Bengali`;

const HELP_BN = `জিওহেলথ SMS:

CARDIO 22.317 87.300
→ হৃদরোগ হাসপাতাল

EMERGENCY 22.317 87.300
→ আইসিইউ হাসপাতাল

HOSPITAL 22.317 87.300
→ কাছের হাসপাতাল

22.317 87.300 এর জায়গায় আপনার GPS좌표 দিন`;

// ─── Query handlers ───────────────────────────────────────────────────────────

const queryNearbyHospitals = async (lat, lon, specialty = null, emergencyOnly = false) => {
    const userPoint = `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;

    let whereClause = '';
    if (emergencyOnly) {
        whereClause = 'JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id WHERE hm.icu_beds > 0 AND hm.emergency_level >= 2';
    } else if (specialty) {
        whereClause = `
            JOIN doctor_availability da ON h.hospital_id = da.hospital_id
            JOIN doctors d ON da.doctor_id = d.doctor_id
            WHERE LOWER(d.specialization) ILIKE '%${specialty.toLowerCase()}%'
        `;
    } else {
        whereClause = 'LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id WHERE 1=1';
    }

    const query = `
        SELECT DISTINCT
            h.hospital_id,
            h.name AS hospital_name,
            ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000)::numeric, 1) AS distance_km,
            GREATEST(5, ROUND((ST_DistanceSphere(h.geom, ${userPoint}) / 1000 / 40 * 60)::numeric)) AS travel_time_minutes,
            ROUND(ST_DistanceSphere(h.geom, ${userPoint})) AS route_distance_meters,
            hm.hospital_rating,
            hm.emergency_level
        FROM hospitals h
        LEFT JOIN hospital_metrics hm ON h.hospital_id = hm.hospital_id
        ${emergencyOnly ? '' : whereClause}
        ${emergencyOnly ? whereClause : ''}
        ORDER BY distance_km ASC
        LIMIT 3;
    `;

    const { rows } = await db.query(query);
    return rows;
};

// ─── Specialty map — handle common abbreviations ───────────────────────────────

const SPECIALTY_MAP = {
    CARDIO:   'Cardiology',
    HEART:    'Cardiology',
    NEURO:    'Neurology',
    BRAIN:    'Neurology',
    ORTHO:    'Orthopedics',
    BONE:     'Orthopedics',
    PEDIA:    'Pediatrics',
    CHILD:    'Pediatrics',
    GYNA:     'Gynaecology',
    GYNAE:    'Gynaecology',
    ENT:      'ENT',
    EYE:      'Ophthalmology',
    SKIN:     'Dermatology',
    ONCO:     'Oncology',
    CANCER:   'Oncology',
    PSYCH:    'Psychiatry',
    MENTAL:   'Psychiatry',
    KIDNEY:   'Nephrology',
    LUNG:     'Pulmonology',
    SURGERY:  'Surgeon',
    DENTAL:   'Dental',
    TEETH:    'Dental',
    GENERAL:  'General Medicine',
};

// ─── Main webhook handler ─────────────────────────────────────────────────────

exports.handleSmsWebhook = async (req, res) => {
    // Fast2SMS sends via GET or POST depending on config
    const body    = req.body || {};
    const rawMsg  = body.message || req.query.message || '';
    const phone   = body.sender  || body.mobile || req.query.sender || '';

    console.log(`[SMS] From ${phone}: "${rawMsg}"`);

    // Always return 200 to SMS gateway immediately
    res.status(200).json({ status: 'received' });

    if (!rawMsg.trim()) return;

    try {
        const { cmd, lat, lon, hasLocation } = parseMessage(rawMsg);

        // ── HELP ─────────────────────────────────────────────────────────
        if (cmd === 'HELP') {
            const lang = rawMsg.toUpperCase().includes('BN') ? 'bn' : 'en';
            await sendSMS(phone, lang === 'bn' ? HELP_BN : HELP_EN);
            return;
        }

        // ── All other commands need a location ────────────────────────────
        if (!hasLocation) {
            await sendSMS(phone,
                `GeoHealth: Please include your GPS coordinates.\n\nExample:\n${cmd || 'HOSPITAL'} 22.317 87.300\n\nReply HELP for all commands.`
            );
            return;
        }

        let hospitals, title;

        // ── EMERGENCY ─────────────────────────────────────────────────────
        if (cmd === 'EMERGENCY') {
            hospitals = await queryNearbyHospitals(lat, lon, null, true);
            title     = '🚨 Nearest Emergency/ICU:';
        }
        // ── HOSPITAL ──────────────────────────────────────────────────────
        else if (cmd === 'HOSPITAL') {
            hospitals = await queryNearbyHospitals(lat, lon);
            title     = '🏥 Nearest Hospitals:';
        }
        // ── Specialty commands ─────────────────────────────────────────────
        else {
            const specialty = SPECIALTY_MAP[cmd] || cmd;
            hospitals = await queryNearbyHospitals(lat, lon, specialty);
            title     = hospitals.length > 0
                ? `🏥 ${specialty} near you:`
                : null;

            if (!hospitals.length) {
                await sendSMS(phone,
                    `GeoHealth: No ${specialty} hospitals found near ${lat.toFixed(3)}, ${lon.toFixed(3)}.\n\nTry: HOSPITAL ${lat.toFixed(3)} ${lon.toFixed(3)}\nfor all nearby hospitals.`
                );
                return;
            }
        }

        const response = formatHospitals(hospitals, title);
        await sendSMS(phone, response);

        console.log(`[SMS] Replied to ${phone}: ${hospitals.length} hospitals`);

    } catch (err) {
        console.error('[SMS] Error:', err.message);
        try {
            await sendSMS(phone,
                'GeoHealth: Sorry, service is temporarily unavailable. Please try again or call 112 for emergency.'
            );
        } catch { /* silent */ }
    }
};

// ─── Test endpoint (query without sending) ────────────────────────────────────

exports.testSms = async (req, res) => {
    const { message, phone = 'test' } = req.query;
    if (!message) return res.status(400).json({ error: 'Pass ?message=CARDIO+22.317+87.300' });

    const { cmd, lat, lon, hasLocation } = parseMessage(message);

    try {
        let hospitals = [];
        if (hasLocation) {
            if (cmd === 'EMERGENCY') {
                hospitals = await queryNearbyHospitals(lat, lon, null, true);
            } else {
                const specialty = SPECIALTY_MAP[cmd] || (cmd !== 'HOSPITAL' ? cmd : null);
                hospitals = await queryNearbyHospitals(lat, lon, specialty);
            }
        }

        const response = hospitals.length
            ? formatHospitals(hospitals, `${cmd} near you:`)
            : HELP_EN;

        res.json({ parsed: { cmd, lat, lon, hasLocation }, hospitals, sms_response: response });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Send SMS endpoint (called from frontend) ──────────────────────────────────

exports.sendSmsQuery = async (req, res) => {
    const { message, phone } = req.body;

    if (!message || !phone) {
        return res.status(400).json({ error: 'Missing message or phone number' });
    }

    console.log(`[SMS-Send] From ${phone}: "${message}"`);

    try {
        const { cmd, lat, lon, hasLocation } = parseMessage(message);

        // ── Validate location ─────────────────────────────────────────────
        if (!hasLocation) {
            return res.status(400).json({
                error: 'Invalid location. Include GPS coordinates (e.g., HOSPITAL 22.317 87.300)',
                sms_text: message
            });
        }

        // ── Query hospitals ───────────────────────────────────────────────
        let hospitals, title;

        if (cmd === 'EMERGENCY') {
            hospitals = await queryNearbyHospitals(lat, lon, null, true);
            title = '🚨 Nearest Emergency/ICU:';
        } else if (cmd === 'HOSPITAL') {
            hospitals = await queryNearbyHospitals(lat, lon);
            title = '🏥 Nearest Hospitals:';
        } else {
            const specialty = SPECIALTY_MAP[cmd] || cmd;
            hospitals = await queryNearbyHospitals(lat, lon, specialty);
            title = hospitals.length > 0 ? `🏥 ${specialty} near you:` : null;

            if (!hospitals.length) {
                return res.status(400).json({
                    error: `No ${specialty} hospitals found near ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
                    sms_text: message
                });
            }
        }

        // ── Format response ───────────────────────────────────────────────
        const smsResponse = formatHospitals(hospitals, title);

        // ── Send SMS ──────────────────────────────────────────────────────
        const smsResult = await sendSMS(phone, smsResponse);

        console.log(`[SMS-Send] Sent to ${phone}: ${hospitals.length} hospitals`);

        res.json({
            success: true,
            message: 'SMS sent successfully',
            hospitals_found: hospitals.length,
            sms_response: smsResponse,
            api_response: smsResult
        });

    } catch (err) {
        console.error('[SMS-Send] Error:', err.message);
        res.status(500).json({
            error: 'Failed to send SMS: ' + err.message,
            message
        });
    }
};