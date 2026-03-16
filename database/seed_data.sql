
TRUNCATE TABLE doctor_availability, doctors, hospitals RESTART IDENTITY CASCADE;

INSERT INTO hospitals (name, address, phone, pincode, website_link, geom) VALUES
('Daspur Rural Hospital',                'Daspur PS',                          '03225-254251', '721211', NULL,                           ST_SetSRID(ST_MakePoint(87.72234,22.60668), 4326)),
('Ghatal Sub Divisional Hospital',       'Kuspata, Ghatal',                    '03225255064',  '721212', NULL,                           ST_SetSRID(ST_MakePoint(87.73785,22.65696), 4326)),
('Keshiary Block Rural Hospital',        'Keshiary PS',                        '03229-252226', '721133', NULL,                           ST_SetSRID(ST_MakePoint(87.22830,22.12767), 4326)),
('Keshpur Rural Hospital',               'Keshpur',                            '03227-250257', '721150', NULL,                           ST_SetSRID(ST_MakePoint(87.45783,22.55202), 4326)),
('KEWAKOLE BPHC',                        'Goaltore',                           '03227-288750', '721128', NULL,                           ST_SetSRID(ST_MakePoint(87.18426,22.70813), 4326)),
('Kharagpur Sub Divisional Hospital',    'Ward - 27, Kharagpur Municipality',  '9434061074',   '721301', NULL,                           ST_SetSRID(ST_MakePoint(87.31470,22.32764), 4326)),
('Midnapore Medical College and Hospital','Vidyasagar Road, Midnapore',        '03222275503',  NULL,     'http://midnaporemmc.ac.in/',   ST_SetSRID(ST_MakePoint(87.3224, 22.4246),  4326)),
('Mohar Gramin Hospital',                'Sabang',                             '8768630287',   '721144', NULL,                           ST_SetSRID(ST_MakePoint(87.6000, 22.1760),  4326)),
('SABANG RURAL HOSPITAL',                'SABANG',                             '8334891277',   '721144', NULL,                           ST_SetSRID(ST_MakePoint(87.59294,22.18025), 4326)),
('Salboni Rural Hospital',               'Salboni',                            '03227-285223', '721132', NULL,                           ST_SetSRID(ST_MakePoint(87.31521,22.64064), 4326)),
('Sonakhali B.P.H.C',                    'Daspur',                             '03225-248308', '721211', NULL,                           ST_SetSRID(ST_MakePoint(87.76706,22.54980), 4326)),
('Jhargram District Hospital',           'Raghunathpur, Jhargram',             NULL,           '721507', NULL,                           ST_SetSRID(ST_MakePoint(86.9984, 22.4476),  4326)),
('Debra Super Speciality Hospital',      'State Highway 4, Debra',             NULL,           '721126', NULL,                           ST_SetSRID(ST_MakePoint(87.5619, 22.3828),  4326)),
('B.C. Roy Technology Hospital',         'IIT Kharagpur Campus, Kharagpur',    NULL,           '721302', NULL,                           ST_SetSRID(ST_MakePoint(87.30042,22.31671), 4326));

-- =============================================================================
--  hospital_metrics
--  Columns: hospital_id, total_beds, available_beds, icu_beds, ventilators,
--           emergency_level, ambulance_available,
--           avg_wait_time_minutes, patients_waiting,
--           cost_level, hospital_rating,
--           ct_scan, mri, pharmacy, blood_bank,
--           wheelchair_access, parking_available
--
--  Bed availability realism guide:
--    RED    (crowded)  → available_beds < 15% of total  e.g. 50 total, 4 available
--    YELLOW (moderate) → available_beds 15-40% of total e.g. 80 total, 20 available
--    GREEN  (good)     → available_beds > 40% of total  e.g. 150 total, 75 available
--
--  Small rural PHCs (1,3,4,8,9,11) are typically overcrowded → RED
--  Sub-divisional (2,5,6,10,13) → YELLOW  (moderate load)
--  Major/Dist hospitals (7,12) → GREEN-YELLOW (better capacity)
--  Specialist/Private (14) → GREEN  (low load, fee-based)
-- =============================================================================

INSERT INTO hospital_metrics VALUES
-- 1  Daspur Rural Hospital        — tiny PHSC, usually full (RED: 4/50 = 8%)
(1,  50,   4,  1,  0,   1, TRUE,   55, 12,  1, 3.5, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE),

-- 2  Ghatal Sub Divisional        — moderate load (YELLOW: 18/80 = 22%)
(2,  80,  18,  4,  2,   2, TRUE,   45, 18,  1, 4.0, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE),

-- 3  Keshiary Block Rural         — very overcrowded (RED: 3/40 = 7%)
(3,  40,   3,  1,  0,   1, FALSE,  50, 14,  1, 3.4, FALSE, FALSE, TRUE,  FALSE, TRUE,  FALSE),

-- 4  Keshpur Rural                — overcrowded (RED: 5/45 = 11%)
(4,  45,   5,  1,  0,   1, FALSE,  60, 15,  1, 3.5, FALSE, FALSE, TRUE,  FALSE, TRUE,  FALSE),

-- 5  KEWAKOLE BPHC                — moderate (YELLOW: 20/60 = 33%)
(5,  60,  20,  3,  1,   2, TRUE,   40, 10,  1, 3.8, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE),

-- 6  Kharagpur Sub Divisional     — moderate-good (YELLOW: 52/150 = 35%)
(6,  150, 52, 10,  5,   2, TRUE,   35, 22,  2, 4.2, TRUE,  FALSE, TRUE,  TRUE,  TRUE,  TRUE),

-- 7  Midnapore Medical College    — large, good capacity (GREEN: 210/500 = 42%)
(7,  500, 210, 45, 20,  3, TRUE,   50, 55,  2, 4.6, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),

-- 8  Mohar Gramin Hospital        — very small, packed (RED: 3/35 = 9%)
(8,  35,   3,  1,  0,   1, FALSE,  65, 11,  1, 3.3, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE),

-- 9  SABANG RURAL HOSPITAL        — overcrowded (RED: 4/40 = 10%)
(9,  40,   4,  2,  0,   1, FALSE,  58, 13,  1, 3.5, FALSE, FALSE, TRUE,  FALSE, TRUE,  FALSE),

-- 10 Salboni Rural Hospital       — moderate (YELLOW: 16/55 = 29%)
(10, 55,  16,  3,  1,   2, TRUE,   38, 10,  1, 3.8, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE),

-- 11 Sonakhali B.P.H.C            — overcrowded (RED: 4/45 = 9%)
(11, 45,   4,  1,  0,   1, FALSE,  48, 12,  1, 3.6, FALSE, FALSE, TRUE,  FALSE, TRUE,  FALSE),

-- 12 Jhargram District Hospital   — good (GREEN: 90/200 = 45%)
(12, 200, 90, 18,  8,   3, TRUE,   42, 35,  2, 4.4, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),

-- 13 Debra Super Speciality       — moderate-good (YELLOW: 40/120 = 33%)
(13, 120, 40,  8,  4,   2, TRUE,   30, 18,  2, 4.3, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),

-- 14 B.C. Roy Technology Hospital — low load, fee-based (GREEN: 55/80 = 69%)
(14, 80,  55,  6,  3,   2, TRUE,   20,  6,  2, 4.5, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE);

-- =============================================================================
--  Doctors
-- =============================================================================

INSERT INTO doctors (name, specialization) VALUES
('Dr. A. K. Sharma',         'Cardiology'),
('Dr. B. Dasgupta',          'Pediatrics'),
('Dr. C. Sen',               'Orthopedics'),
('Dr. D. Ghosh',             'Cardiology'),
('Dr. E. Roy',               'General Medicine'),
('Dr. F. Khatun',            'Gynaecology'),
('Dr. G. Mishra',            'Dermatology'),
('Dr. H. Singh',             'ENT'),
('Dr. I. Chatterjee',        'Neurology'),
('Dr. J. Ali',               'Pulmonology'),
('Dr. K. Maity',             'Oncology'),
('Dr. L. Basu',              'Psychiatry'),
('Dr. M. Paul',              'Nephrology'),
('Dr. N. Patra',             'General Physician'),
('Dr. Hari Charan Ray',      'Gynaecology'),
('Dr. Parwati Patanik',      'Gynaecology'),
('Dr. Atis Basak',           'General Medicine'),
('Dr. Supriyo Pramanik',     'General Medicine'),
('Dr. Sarbesh Sengupta',     'Psychiatry'),
('Dr. Debabrata Majumder',   'Psychiatry'),
('Dr. Mahasweta Choudhuri',  'Pediatrics'),
('Dr. Archana Saha',         'Dermatology'),
('Dr. Monajit Mandal',       'Surgeon'),
('Dr. Roma Basumaiti',       'Ophthalmology'),
('Dr. Deepshikha Singh',     'Ophthalmology'),
('Dr. S Behera',             'Ophthalmology'),
('Dr. Sanjay Kr Gupta',      'ENT'),
('Dr. Sarvesh P Azgaonkar',  'ENT'),
('Dr. A.K. Maity',           'ENT'),
('Dr. Aditi Bhattacharjee',  'Pathology'),
('Dr. Arijit Das',           'Orthopedics'),
('Dr. Anjan Siotia',         'Cardiology'),
('Dr. Saubhik Kanjilal',     'Cardiology'),
('Dr. Barnali Pal (Ghosh)',  'Dental'),
('Dr. Radha Prabhu K',       'Dental'),
('Ms. Barnali Mukherjee',    'Optometry'),
('Dr. Sunandan Basu',        'Neurosurgery'),
('Dr. Arindam Datta',        'Pulmonology'),
('Dr. Arunava Nath',         'Homeopathy'),
('Dr. Balaram Sahoo',        'Public Health'),
('Dr. Moumita Maity',        'Oncology');

-- =============================================================================
--  Doctor availability
-- =============================================================================

INSERT INTO doctor_availability (doctor_id, hospital_id, day_of_week, start_time, end_time) VALUES
(1, 7, 1, '09:00', '13:00'), (1, 7, 3, '09:00', '13:00'), (1, 6, 5, '10:00', '14:00'),
(2, 6, 2, '10:00', '14:00'), (2, 6, 4, '10:00', '14:00'),
(3, 2, 5, '11:00', '15:00'), (3, 13, 1, '09:00', '13:00'),
(4, 6, 6, '09:00', '12:00'), (4, 6, 7, '09:00', '12:00'),
(5, 7, 1, '08:00', '16:00'), (5, 10, 3, '09:00', '17:00'), (5, 6, 5, '10:00', '18:00'),
(6, 12, 2, '10:00', '13:00'), (6, 12, 4, '10:00', '13:00'),
(7, 13, 1, '14:00', '17:00'), (7, 7, 5, '14:00', '17:00'), (7, 14, 3, '16:00', '18:00'),
(8, 6, 3, '15:00', '18:00'),
(9, 7, 2, '10:00', '14:00'), (9, 7, 5, '10:00', '14:00'), (9, 6, 4, '14:00', '17:00'),
(10, 13, 4, '11:00', '15:00'),
(11, 7, 1, '12:00', '16:00'), (11, 14, 5, '10:00', '13:00'),
(12, 6, 1, '10:00', '13:00'), (12, 2, 4, '14:00', '17:00'),
(13, 7, 6, '09:00', '13:00'),
(14, 3, 1, '09:00', '17:00'), (14, 9, 3, '09:00', '17:00'), (14, 1, 5, '09:00', '17:00'),
(15, 14, 1, '17:00', '19:00'), (15, 14, 5, '17:00', '19:00'),
(16, 14, 3, '17:00', '19:00'), (16, 14, 6, '17:00', '19:00'),
(17, 14, 1, '17:00', '19:00'), (17, 14, 3, '17:00', '19:00'), (17, 14, 5, '17:00', '19:00'), (17, 14, 6, '17:00', '19:00'),
(17, 7,  2, '09:00', '13:00'),
(18, 14, 6, '11:00', '13:00'),
(19, 14, 1, '18:00', '20:00'), (19, 14, 3, '18:00', '20:00'),
(20, 14, 5, '18:00', '20:00'),
(21, 14, 1, '16:00', '18:00'), (21, 14, 2, '16:00', '18:00'), (21, 14, 3, '16:00', '18:00'),
(21, 14, 4, '08:30', '10:30'), (21, 14, 6, '09:00', '12:00'), (21, 6, 5, '10:00', '13:00'),
(22, 14, 1, '16:00', '18:00'), (22, 14, 4, '16:00', '19:00'), (22, 14, 6, '10:00', '13:00'),
(23, 14, 2, '17:00', '19:00'), (23, 14, 4, '17:00', '19:00'),
(24, 14, 4, '16:00', '19:00'), (24, 14, 5, '17:00', '19:00'),
(25, 14, 2, '16:00', '19:00'), (25, 14, 3, '16:00', '19:00'),
(26, 14, 1, '16:00', '18:00'), (26, 14, 3, '10:00', '12:00'),
(27, 14, 5, '10:00', '16:00'),
(28, 14, 2, '16:00', '19:00'),
(29, 14, 4, '16:00', '19:00'),
(30, 14, 1, '18:00', '20:00'), (30, 14, 3, '18:00', '20:00'), (30, 14, 6, '18:00', '20:00'),
(31, 14, 1, '17:30', '20:00'), (31, 7, 3, '10:00', '14:00'),
(32, 14, 4, '09:00', '15:00'), (32, 7, 1, '14:00', '17:00'),
(33, 14, 2, '09:00', '15:00'), (33, 6, 5, '09:00', '15:00'),
(34, 14, 1, '09:30', '11:30'), (34, 14, 3, '09:30', '11:30'), (34, 14, 4, '09:30', '11:30'),
(34, 14, 2, '17:00', '19:00'), (34, 14, 5, '17:00', '19:00'), (34, 14, 6, '11:00', '13:00'),
(35, 14, 2, '09:00', '11:00'), (35, 14, 4, '17:00', '19:00'), (35, 14, 5, '09:00', '11:00'),
(36, 14, 1, '09:00', '12:30'), (36, 14, 2, '09:00', '12:30'), (36, 14, 3, '09:00', '12:30'),
(36, 14, 4, '09:00', '12:30'), (36, 14, 5, '09:00', '12:30'), (36, 14, 6, '09:00', '12:30'),
(36, 14, 1, '16:00', '19:00'), (36, 14, 2, '16:00', '19:00'), (36, 14, 3, '16:00', '19:00'),
(36, 14, 4, '16:00', '19:00'), (36, 14, 5, '16:00', '19:00'), (36, 14, 6, '16:00', '19:00'),
(38, 14, 3, '16:00', '19:00'),
(39, 14, 3, '16:30', '18:30'), (39, 14, 6, '16:30', '18:30'),
(40, 14, 1, '18:00', '20:00'), (40, 14, 3, '18:00', '20:00'),
(40, 14, 4, '18:00', '20:00'), (40, 14, 5, '18:00', '20:00');