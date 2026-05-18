/*
  Warnings:

  - You are about to drop the column `age` on the `Profile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[doctorId,dayOfWeek,startTime,specificDate]` on the table `TimeSlot` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TimeSlot_doctorId_dayOfWeek_startTime_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "videoSessionActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoSessionEndedAt" TIMESTAMP(3),
ADD COLUMN     "videoSessionStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "age",
ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "language" TEXT,
ADD COLUMN     "motifs" TEXT,
ADD COLUMN     "prefGender" TEXT,
ADD COLUMN     "prefType" TEXT,
ADD COLUMN     "tarif" INTEGER;

-- AlterTable
ALTER TABLE "TimeSlot" ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "specificDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentCallId" TEXT,
ADD COLUMN     "currentCallPartnerId" TEXT,
ADD COLUMN     "currentCallStartedAt" TIMESTAMP(3),
ADD COLUMN     "urgentAccessExpiry" TIMESTAMP(3),
ADD COLUMN     "urgentAccessStart" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UrgentRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 1000,
    "isVip" BOOLEAN NOT NULL DEFAULT true,
    "priority" BOOLEAN NOT NULL DEFAULT true,
    "appointmentTime" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "theme" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 10,
    "currentParticipants" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER,
    "icon" TEXT NOT NULL DEFAULT 'group',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "psychologueId" TEXT,

    CONSTRAINT "TherapyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSessionRating" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupSessionRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VIPSubscription" (
    "id" TEXT NOT NULL,
    "psychologueId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VIPSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VIPForm" (
    "id" TEXT NOT NULL,
    "psychologueId" TEXT NOT NULL,
    "question1" TEXT,
    "question2" TEXT,
    "question3" TEXT,
    "question4" TEXT,
    "question5" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VIPForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientNote" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapyGroup_psychologueId_idx" ON "TherapyGroup"("psychologueId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GroupSessionRating_doctorId_idx" ON "GroupSessionRating"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSessionRating_patientId_doctorId_groupId_key" ON "GroupSessionRating"("patientId", "doctorId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "VIPForm_psychologueId_key" ON "VIPForm"("psychologueId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_doctorId_dayOfWeek_startTime_specificDate_key" ON "TimeSlot"("doctorId", "dayOfWeek", "startTime", "specificDate");

-- AddForeignKey
ALTER TABLE "UrgentRequest" ADD CONSTRAINT "UrgentRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrgentRequest" ADD CONSTRAINT "UrgentRequest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyGroup" ADD CONSTRAINT "TherapyGroup_psychologueId_fkey" FOREIGN KEY ("psychologueId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TherapyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSessionRating" ADD CONSTRAINT "GroupSessionRating_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSessionRating" ADD CONSTRAINT "GroupSessionRating_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSessionRating" ADD CONSTRAINT "GroupSessionRating_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TherapyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VIPSubscription" ADD CONSTRAINT "VIPSubscription_psychologueId_fkey" FOREIGN KEY ("psychologueId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VIPForm" ADD CONSTRAINT "VIPForm_psychologueId_fkey" FOREIGN KEY ("psychologueId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
