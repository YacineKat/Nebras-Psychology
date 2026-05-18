-- AlterTable: Add status to User
ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable: ValidationRequest
CREATE TABLE "ValidationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "specialite" TEXT,
    "universite" TEXT,
    "bio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Document
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "validationRequestId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Transaction
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "subscriptionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlatformSettings
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT 'Nebras',
    "contactEmail" TEXT NOT NULL DEFAULT 'contact@nebras.dz',
    "phone" TEXT NOT NULL DEFAULT '+213 XXX XXX XXX',
    "consultationPrice" INTEGER NOT NULL DEFAULT 1000,
    "vipMonthlyPrice" INTEGER NOT NULL DEFAULT 5000,
    "platformCommission" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "ValidationRequest_userId_key" ON "ValidationRequest"("userId");

-- AddForeignKeys
ALTER TABLE "ValidationRequest" ADD CONSTRAINT "ValidationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationRequest" ADD CONSTRAINT "ValidationRequest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_validationRequestId_fkey" FOREIGN KEY ("validationRequestId") REFERENCES "ValidationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
