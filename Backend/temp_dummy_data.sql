-- Add more sample patients
INSERT INTO "User" (id, email, password, fullname, "userType", "createdAt")
VALUES 
  (gen_random_uuid(), 'fatima@test.com', '$2a$10$test', 'Fatima Benali', 'patient', NOW()),
  (gen_random_uuid(), 'ahmed@test.com', '$2a$10$test', 'Ahmed Mansouri', 'patient', NOW()),
  (gen_random_uuid(), 'sara@test.com', '$2a$10$test', 'Sara Kouadri', 'patient', NOW())
ON CONFLICT (email) DO NOTHING;

-- Get the psychologue ID
DO $$
DECLARE
  psych_id TEXT;
  patient_id1 TEXT;
  patient_id2 TEXT;
  patient_id3 TEXT;
BEGIN
  -- Get psychologue ID
  SELECT id INTO psych_id FROM "User" WHERE "userType" = 'psychologue' LIMIT 1;
  
  -- Get patient IDs
  SELECT id INTO patient_id1 FROM "User" WHERE email = 'fatima@test.com';
  SELECT id INTO patient_id2 FROM "User" WHERE email = 'ahmed@test.com';
  SELECT id INTO patient_id3 FROM "User" WHERE email = 'sara@test.com';
  
  -- Update psychologue profile with tariff
  UPDATE "Profile" SET "tarif" = 3000 WHERE "userId" = psych_id;
  
  -- Add more pending requests (demandes en attente)
  INSERT INTO "Appointment" (id, "patientId", "doctorId", "appointmentDate", "appointmentTime", "mediaType", "status", "notes", "createdAt")
  VALUES 
    (gen_random_uuid(), patient_id1, psych_id, CURRENT_DATE + INTERVAL '2 days', '10:00', 'video', 'pending', 'Dépression', NOW() - INTERVAL '1 day'),
    (gen_random_uuid(), patient_id2, psych_id, CURRENT_DATE + INTERVAL '3 days', '14:00', 'phone', 'pending', 'Anxiété', NOW() - INTERVAL '2 days'),
    (gen_random_uuid(), patient_id3, psych_id, CURRENT_DATE + INTERVAL '1 day', '09:15', 'video', 'pending', 'Stress', NOW() - INTERVAL '1 day')
  ON CONFLICT DO NOTHING;
  
  -- Add more confirmed appointments for upcoming
  INSERT INTO "Appointment" (id, "patientId", "doctorId", "appointmentDate", "appointmentTime", "mediaType", "status", "notes", "createdAt")
  VALUES 
    (gen_random_uuid(), (SELECT id FROM "User" WHERE email = 'yacine@gmail.com'), psych_id, CURRENT_DATE + INTERVAL '4 days', '11:00', 'video', 'confirmed', 'Anxiété', NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), patient_id1, psych_id, CURRENT_DATE + INTERVAL '5 days', '15:00', 'chat', 'confirmed', 'Dépression', NOW() - INTERVAL '3 days')
  ON CONFLICT DO NOTHING;
END $$;