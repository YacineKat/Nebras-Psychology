const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin user
  const adminEmail = 'admin@nebras.dz';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        fullname: 'Administrateur',
        userType: 'admin',
        status: 'active',
        profile: {
          create: {
            phone: '+213 XXX XXX XXX'
          }
        }
      },
      include: { profile: true }
    });
    console.log('Admin user created:', admin.email);
  } else {
    console.log('Admin user already exists:', admin.email);
  }

  // Create default platform settings
  let settings = await prisma.platformSettings.findFirst();
  if (!settings) {
    settings = await prisma.platformSettings.create({
      data: {
        siteName: 'Nebras',
        contactEmail: 'contact@nebras.dz',
        phone: '+213 XXX XXX XXX',
        consultationPrice: 1000,
        vipMonthlyPrice: 5000,
        platformCommission: 10,
        updatedBy: admin.id
      }
    });
    console.log('Platform settings created');
  } else {
    console.log('Platform settings already exist');
  }

  console.log('Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
