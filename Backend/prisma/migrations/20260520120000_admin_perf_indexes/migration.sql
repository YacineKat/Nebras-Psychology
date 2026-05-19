-- Admin performance indexes
-- Run via Supabase SQL Editor (DDL blocked by pooler)

-- User: admin stats/dashboard filters (userType + status, createdAt, status)
CREATE INDEX IF NOT EXISTS "user_type_status_idx" ON "User" ("userType", "status");
CREATE INDEX IF NOT EXISTS "user_created_at_idx" ON "User" ("createdAt");
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "User" ("status");

-- Profile: top professionals sort (rating DESC)
CREATE INDEX IF NOT EXISTS "profile_rating_idx" ON "Profile" ("rating");

-- Appointment: admin stats daily appointments query (appointmentDate)
CREATE INDEX IF NOT EXISTS "appointment_date_idx" ON "Appointment" ("appointmentDate");

-- VIPSubscription: admin distribution query (isActive)
CREATE INDEX IF NOT EXISTS "vipsub_is_active_idx" ON "VIPSubscription" ("isActive");

-- Transaction: admin payments/revenue queries (status, createdAt)
CREATE INDEX IF NOT EXISTS "transaction_status_idx" ON "Transaction" ("status");
CREATE INDEX IF NOT EXISTS "transaction_created_at_idx" ON "Transaction" ("createdAt");
CREATE INDEX IF NOT EXISTS "transaction_status_created_at_idx" ON "Transaction" ("status", "createdAt");
