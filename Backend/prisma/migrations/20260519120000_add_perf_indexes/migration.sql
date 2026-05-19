-- Add denormalized counter columns to Profile
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "sessionsCompleted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "patientsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "reviewsCount" INTEGER NOT NULL DEFAULT 0;

-- Add performance indexes on Appointment
CREATE INDEX IF NOT EXISTS "appointments_doctor_id_idx" ON "Appointment" ("doctorId");
CREATE INDEX IF NOT EXISTS "appointments_doctor_id_status_idx" ON "Appointment" ("doctorId", "status");
CREATE INDEX IF NOT EXISTS "appointments_doctor_id_patient_id_idx" ON "Appointment" ("doctorId", "patientId");
CREATE INDEX IF NOT EXISTS "appointments_patient_id_idx" ON "Appointment" ("patientId");
CREATE INDEX IF NOT EXISTS "appointments_doctor_id_date_status_idx" ON "Appointment" ("doctorId", "appointmentDate", "status");
