-- DESCRIPTION: Inserts sample data into the tables.

-- Clear existing data before seeding
TRUNCATE TABLE doctor_availability, doctors, hospitals RESTART IDENTITY CASCADE;

-- Insert sample hospitals in West Midnapore
-- ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) creates a spatial point.
INSERT INTO hospitals (name, address, geom) VALUES
('Midnapore Medical College & Hospital', 'Vidyasagar Road, Medinipur', ST_SetSRID(ST_MakePoint(87.3239, 22.4271), 4326)),
('Kharagpur Sub-Divisional Hospital', 'Near Kharagpur Railway Station, Kharagpur', ST_SetSRID(ST_MakePoint(87.3325, 22.3458), 4326)),
('Ghatal Sub-Divisional Hospital', 'Ghatal, West Medinipur', ST_SetSRID(ST_MakePoint(87.7250, 22.6732), 4326)),
('Rural Health Centre - Salboni', 'Salboni, West Medinipur', ST_SetSRID(ST_MakePoint(87.3167, 22.6333), 4326));

-- Insert sample doctors
INSERT INTO doctors (name, specialization) VALUES
('Dr. A. K. Sharma', 'Cardiology'),
('Dr. B. Dasgupta', 'Pediatrics'),
('Dr. C. Sen', 'Orthopedics'),
('Dr. D. Ghosh', 'Cardiology'),
('Dr. E. Roy', 'General Medicine');

-- Link doctors to hospitals with their availability schedules
-- (doctor_id, hospital_id, day_of_week, start_time, end_time)
INSERT INTO doctor_availability (doctor_id, hospital_id, day_of_week, start_time, end_time) VALUES
-- Dr. Sharma (Cardiologist) at Midnapore Medical College on Mon, Wed
(1, 1, 1, '09:00:00', '13:00:00'), -- Monday
(1, 1, 3, '09:00:00', '13:00:00'), -- Wednesday
-- Dr. Dasgupta (Pediatrician) at Kharagpur Hospital on Tue, Thu
(2, 2, 2, '10:00:00', '14:00:00'), -- Tuesday
(2, 2, 4, '10:00:00', '14:00:00'), -- Thursday
-- Dr. Sen (Orthopedist) at Ghatal Hospital on Friday
(3, 3, 5, '11:00:00', '15:00:00'), -- Friday
-- Dr. Ghosh (Cardiologist) at Kharagpur Hospital on weekends
(4, 2, 6, '09:00:00', '12:00:00'), -- Saturday
(4, 2, 7, '09:00:00', '12:00:00'), -- Sunday
-- Dr. Roy (General Medicine) everywhere
(5, 1, 1, '08:00:00', '16:00:00'), -- Monday at Midnapore
(5, 4, 3, '09:00:00', '17:00:00'); -- Wednesday at Salboni