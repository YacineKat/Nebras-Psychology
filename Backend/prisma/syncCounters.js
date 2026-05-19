const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureColumns() {
  const sql = [
    `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "sessionsCompleted" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "patientsCount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "reviewsCount" INTEGER NOT NULL DEFAULT 0`
  ];
  try {
    for (const stmt of sql) await prisma.$executeRawUnsafe(stmt);
    console.log('Counter columns ensured.');
  } catch (e) {
    console.log('Could not add columns (Supabase pooler blocks DDL):', e.message);
    console.log('Run this SQL in Supabase SQL Editor, then re-run this script:\n\n' + sql.join(';\n') + '\n');
    throw e;
  }
}

async function createIndexes() {
  try {
    await prisma.$executeRawUnsafe(`SET statement_timeout = '120s'`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "appointments_doctor_id_idx" ON "Appointment" ("doctorId")`);
    console.log('  Index 1/5 done');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "appointments_doctor_id_status_idx" ON "Appointment" ("doctorId", "status")`);
    console.log('  Index 2/5 done');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "appointments_doctor_id_patient_id_idx" ON "Appointment" ("doctorId", "patientId")`);
    console.log('  Index 3/5 done');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "appointments_patient_id_idx" ON "Appointment" ("patientId")`);
    console.log('  Index 4/5 done');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "appointments_doctor_id_date_status_idx" ON "Appointment" ("doctorId", "appointmentDate", "status")`);
    console.log('  Index 5/5 done');
    console.log('Indexes ensured.');
  } catch (e) {
    console.log('Could not create indexes:', e.message);
    console.log('Run this SQL in Supabase SQL Editor if needed:\n\nCREATE INDEX IF NOT EXISTS "appointments_doctor_id_idx" ON "Appointment" ("doctorId");\n...');
  }
}

async function syncDoctorCounters() {
  const doctors = await prisma.user.findMany({
    where: {
      userType: { in: ['psychologue', 'counselor'] }
    },
    select: { id: true }
  });

  console.log(`Syncing counters for ${doctors.length} doctors...`);

  for (const doctor of doctors) {
    const [sessionsCompleted, patientsResult, reviewsCount] = await Promise.all([
      prisma.appointment.count({
        where: { doctorId: doctor.id, status: 'completed' }
      }),
      prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          doctorId: doctor.id,
          status: { in: ['completed', 'confirmed'] }
        },
        _count: true
      }),
      prisma.review.count({
        where: { doctorId: doctor.id }
      })
    ]);

    await prisma.profile.update({
      where: { userId: doctor.id },
      data: {
        sessionsCompleted,
        patientsCount: patientsResult.length,
        reviewsCount
      }
    });

    console.log(`  Synced doctor ${doctor.id}: ${sessionsCompleted} sessions, ${patientsResult.length} patients, ${reviewsCount} reviews`);
  }

  console.log('Counters synced successfully');
}

ensureColumns()
  .then(() => createIndexes())
  .then(() => syncDoctorCounters())
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
