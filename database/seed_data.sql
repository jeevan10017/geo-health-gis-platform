-- Clear existing data before seeding
TRUNCATE TABLE doctor_availability, doctors, hospitals RESTART IDENTITY CASCADE;

-- Insert hospitals in and around Paschim Medinipur
-- ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) creates a spatial point.
INSERT INTO hospitals (name, address, phone, pincode, website_link, geom) VALUES
-- Hospitals from user data
('Daspur Rural Hospital', 'Daspur PS', '03225-254251', '721211', NULL, ST_SetSRID(ST_MakePoint(87.72234,22.60668), 4326)),
('Ghatal Sub Divisional Hospital', 'Kuspata, Ghatal', '03225255064', '721212', NULL, ST_SetSRID(ST_MakePoint(87.73785,22.65696), 4326)),
('Keshiary Block Rural Hospital', 'Keshiary PS', '03229-252226', '721133', NULL, ST_SetSRID(ST_MakePoint(87.22830,22.12767), 4326)),
('Keshpur Rural Hospital', 'Keshpur', '03227-250257', '721150', NULL, ST_SetSRID(ST_MakePoint(87.45783,22.55202), 4326)),
('KEWAKOLE BPHC', 'Goaltore', '03227-288750', '721128', NULL, ST_SetSRID(ST_MakePoint(87.18426,22.70813), 4326)),
('Kharagpur Sub Divisional Hospital', 'Ward - 27, Kharagpur Municipality', '9434061074', '721301', NULL, ST_SetSRID(ST_MakePoint(87.31470,22.32764), 4326)),
('Midnapore Medical College and Hospital', 'Vidyasagar Road, Midnapore', '03222275503', NULL, 'http://midnaporemmc.ac.in/', ST_SetSRID(ST_MakePoint(87.3224, 22.4246), 4326)),
('Mohar Gramin Hospital', 'Sabang', '8768630287', '721144', NULL, ST_SetSRID(ST_MakePoint(87.6000, 22.1760), 4326)),
('SABANG RURAL HOSPITAL', 'SABANG', '8334891277', '721144', NULL, ST_SetSRID(ST_MakePoint(87.59294,22.18025), 4326)),
('Salboni Rural Hospital', 'Salboni', '03227-285223', '721132', NULL, ST_SetSRID(ST_MakePoint(87.31521,22.64064), 4326)),
('Sonakhali B.P.H.C', 'Daspur', '03225-248308', '721211', NULL, ST_SetSRID(ST_MakePoint(87.76706,22.54980), 4326)),
('Jhargram District Hospital', 'Raghunathpur, Jhargram', NULL, '721507', NULL, ST_SetSRID(ST_MakePoint(86.9984, 22.4476), 4326)),
('Debra Super speciality Hospital', 'State Highway 4, Debra', NULL, '721126', NULL, ST_SetSRID(ST_MakePoint(87.5619, 22.3828), 4326)),
('B.C. Roy Technology Hospital', 'IIT Kharagpur Campus, Kharagpur', NULL, '721302', NULL, ST_SetSRID(ST_MakePoint(87.30042,22.31671), 4326));


-- Insert expanded list of doctors
INSERT INTO doctors (name, specialization) VALUES
-- Original Doctors
('Dr. A. K. Sharma', 'Cardiology'), ('Dr. B. Dasgupta', 'Pediatrics'), ('Dr. C. Sen', 'Orthopedics'),
('Dr. D. Ghosh', 'Cardiology'), ('Dr. E. Roy', 'General Medicine'), ('Dr. F. Khatun', 'Gynaecology'),
('Dr. G. Mishra', 'Dermatology'), ('Dr. H. Singh', 'ENT'), ('Dr. I. Chatterjee', 'Neurology'),
('Dr. J. Ali', 'Pulmonology'), ('Dr. K. Maity', 'Oncology'), ('Dr. L. Basu', 'Psychiatry'),
('Dr. M. Paul', 'Nephrology'), ('Dr. N. Patra', 'General Physician'),
-- Doctors from B.C. Roy Technology Hospital
('Dr. Hari Charan Ray', 'Gynae & Obsterics'), ('Dr. Parwati Patanik', 'Gynae & Obsterics'), ('Dr. Atis Basak', 'Medicine'),
('Dr. Supriyo Pramanik', 'Medicine'), ('Dr. Sarbesh Sengupta', 'Psychiatrist'), ('Dr. Debabrata Majumder', 'Psychiatrist'),
('Dr. Mahasweta Choudhuri', 'Paediatrics'), ('Dr. Archana Saha', 'Dermatologist'), ('Dr. Monajit Mandal', 'Surgeon'),
('Dr. Roma Basumaiti', 'Ophthalmologist'), ('Dr. Deepshikha Singh', 'Ophthalmologist'), ('Dr. S Behera', 'Ophthalmologist'),
('Dr. Sanjay Kr Gupta', 'ENT'), ('Dr. Sarvesh P Azgaonkar', 'ENT'), ('Dr. A.K. Maity', 'ENT'),
('Dr. Aditi Bhattacharjee', 'Pathology'), ('Dr. Arijit Das', 'Orthopaedic'), ('Dr. Anjan Siotia', 'Cardiologist'),
('Dr. Saubhik Kanjilal', 'Cardiologist'), ('Dr. Barnali Pal (Ghosh)', 'Dental'), ('Dr. Radha Prabhu K', 'Dental'),
('Ms. Barnali Mukherjee', 'Optometrist'), ('Dr. Sunandan Basu', 'Neuro Surgeon'), ('Dr. Arindam Datta', 'Pulmonology'),
('Dr. Arunava Nath', 'Homeopathy'), ('Dr. Balaram Sahoo', 'Public Health'), ('Dr. Moumita Maity', 'Oncologist');

-- Link doctors to hospitals with their availability schedules (Expanded)
-- ISO day of week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
INSERT INTO doctor_availability (doctor_id, hospital_id, day_of_week, start_time, end_time) VALUES
-- Schedules for original hospitals
(1, 7, 1, '09:00:00', '13:00:00'), (1, 7, 3, '09:00:00', '13:00:00'),
(2, 6, 2, '10:00:00', '14:00:00'), (2, 6, 4, '10:00:00', '14:00:00'),
(3, 2, 5, '11:00:00', '15:00:00'),
(4, 6, 6, '09:00:00', '12:00:00'), (4, 6, 7, '09:00:00', '12:00:00'),
(5, 7, 1, '08:00:00', '16:00:00'), (5, 10, 3, '09:00:00', '17:00:00'),(5, 6, 5, '10:00:00', '18:00:00'),
(6, 12, 2, '10:00:00', '13:00:00'),(6, 12, 4, '10:00:00', '13:00:00'),
(7, 13, 1, '14:00:00', '17:00:00'),(7, 7, 5, '14:00:00', '17:00:00'),
(8, 6, 3, '15:00:00', '18:00:00'),
(9, 7, 2, '10:00:00', '14:00:00'),(9, 7, 5, '10:00:00', '14:00:00'),
(10, 13, 4, '11:00:00', '15:00:00'),
(11, 7, 1, '12:00:00', '16:00:00'),
(12, 6, 1, '10:00:00', '13:00:00'),(12, 2, 4, '14:00:00', '17:00:00'),
(13, 7, 6, '09:00:00', '13:00:00'),
(14, 3, 1, '09:00:00', '17:00:00'),(14, 9, 3, '09:00:00', '17:00:00'),(14, 1, 5, '09:00:00', '17:00:00'),

-- NEW SCHEDULES FOR B.C. ROY TECHNOLOGY HOSPITAL (hospital_id = 14)
-- Gynae & Obsterics
(15, 14, 1, '17:00:00', '19:00:00'), (15, 14, 5, '17:00:00', '19:00:00'), -- Dr. Hari Charan Ray
(16, 14, 3, '17:00:00', '19:00:00'), (16, 14, 6, '17:00:00', '19:00:00'), -- Dr. Parwati Patanik
-- Medicine
(17, 14, 1, '17:00:00', '19:00:00'), (17, 14, 3, '17:00:00', '19:00:00'), (17, 14, 5, '17:00:00', '19:00:00'), (17, 14, 6, '17:00:00', '19:00:00'), -- Dr. Atis Basak
(18, 14, 6, '11:00:00', '13:00:00'), -- Dr. Supriyo Pramanik
-- Psychiatrist
(19, 14, 1, '18:00:00', '20:00:00'), (19, 14, 3, '18:00:00', '20:00:00'), -- Dr. Sarbesh Sengupta
(20, 14, 5, '18:00:00', '20:00:00'), -- Dr. Debabrata Majumder
-- Paediatrics
(21, 14, 1, '16:00:00', '18:00:00'), (21, 14, 2, '16:00:00', '18:00:00'), (21, 14, 3, '16:00:00', '18:00:00'), (21, 14, 4, '08:30:00', '10:30:00'), (21, 14, 6, '09:00:00', '12:00:00'), -- Dr. Mahasweta Choudhuri
-- Dermatologist
(22, 14, 1, '16:00:00', '18:00:00'), (22, 14, 4, '16:00:00', '19:00:00'), (22, 14, 6, '10:00:00', '13:00:00'), -- Dr. Archana Saha
-- Surgeon
(23, 14, 2, '17:00:00', '19:00:00'), (23, 14, 4, '17:00:00', '19:00:00'), -- Dr. Monajit Mandal
-- Ophthalmologist
(24, 14, 4, '16:00:00', '19:00:00'), (24, 14, 5, '17:00:00', '19:00:00'), -- Dr. Roma Basumaiti
(25, 14, 2, '16:00:00', '19:00:00'), (25, 14, 3, '16:00:00', '19:00:00'), -- Dr. Deepshikha Singh
(26, 14, 1, '16:00:00', '18:00:00'), (26, 14, 3, '10:00:00', '12:00:00'), -- Dr. S Behera
-- ENT
(27, 14, 5, '10:00:00', '16:00:00'), -- Dr. Sanjay Kr Gupta
(28, 14, 2, '16:00:00', '19:00:00'), -- Dr. Sarvesh P Azgaonkar
(29, 14, 4, '16:00:00', '19:00:00'), -- Dr. A.K. Maity
-- Pathology
(30, 14, 1, '18:00:00', '20:00:00'), (30, 14, 3, '18:00:00', '20:00:00'), (30, 14, 6, '18:00:00', '20:00:00'), -- Dr. Aditi Bhattacharjee
-- Orthopaedic
(31, 14, 1, '17:30:00', '20:00:00'), -- Dr. Arijit Das
-- Cardiologist
(32, 14, 4, '09:00:00', '15:00:00'), -- Dr. Anjan Siotia
-- Dental
(34, 14, 1, '09:30:00', '11:30:00'), (34, 14, 3, '09:30:00', '11:30:00'), (34, 14, 4, '09:30:00', '11:30:00'), (34, 14, 2, '17:00:00', '19:00:00'), (34, 14, 5, '17:00:00', '19:00:00'), (34, 14, 6, '11:00:00', '13:00:00'), -- Dr. Barnali Pal (Ghosh)
(35, 14, 2, '09:00:00', '11:00:00'), (35, 14, 4, '17:00:00', '19:00:00'), (35, 14, 5, '09:00:00', '11:00:00'), -- Dr. Radha Prabhu K
-- Optometrist
(36, 14, 1, '09:00:00', '12:30:00'), (36, 14, 2, '09:00:00', '12:30:00'), (36, 14, 3, '09:00:00', '12:30:00'), (36, 14, 4, '09:00:00', '12:30:00'), (36, 14, 5, '09:00:00', '12:30:00'), (36, 14, 6, '09:00:00', '12:30:00'), -- Ms. Barnali Mukherjee (Morning)
(36, 14, 1, '16:00:00', '19:00:00'), (36, 14, 2, '16:00:00', '19:00:00'), (36, 14, 3, '16:00:00', '19:00:00'), (36, 14, 4, '16:00:00', '19:00:00'), (36, 14, 5, '16:00:00', '19:00:00'), (36, 14, 6, '16:00:00', '19:00:00'), -- Ms. Barnali Mukherjee (Evening)
-- Pulmonology
(38, 14, 3, '16:00:00', '19:00:00'), -- Dr. Arindam Datta
-- Homeopathy
(39, 14, 3, '16:30:00', '18:30:00'), (39, 14, 6, '16:30:00', '18:30:00'), -- Dr. Arunava Nath
-- Public Health
(40, 14, 1, '18:00:00', '20:00:00'), (40, 14, 3, '18:00:00', '20:00:00'), (40, 14, 4, '18:00:00', '20:00:00'), (40, 14, 5, '18:00:00', '20:00:00'); -- Dr. Balaram Sahoo