-- Drop FK constraint before dropping column
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_validationRequestId_fkey";

-- Drop unused columns
ALTER TABLE "Document" DROP COLUMN IF EXISTS "fileType" CASCADE;
ALTER TABLE "Document" DROP COLUMN IF EXISTS "validationRequestId" CASCADE;
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "subscriptionId" CASCADE;

-- Drop dead columns (always set to same value)
ALTER TABLE "UrgentRequest" DROP COLUMN IF EXISTS "priority" CASCADE;
ALTER TABLE "UrgentRequest" DROP COLUMN IF EXISTS "isVip" CASCADE;

-- Remove System A video-session columns (replaced by User.currentCall*)
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "videoSessionActive" CASCADE;
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "videoSessionStartedAt" CASCADE;
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "videoSessionEndedAt" CASCADE;

-- Drop unused indexes on Appointment
DROP INDEX IF EXISTS "appointments_doctor_id_idx";
DROP INDEX IF EXISTS "appointments_doctor_id_status_idx";
DROP INDEX IF EXISTS "appointments_doctor_id_patient_id_idx";
DROP INDEX IF EXISTS "appointments_patient_id_idx";
DROP INDEX IF EXISTS "appointments_doctor_id_date_status_idx";
