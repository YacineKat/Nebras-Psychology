const prisma = require('../prisma');

// ============================================
// SIDEBAR BADGES (lightweight, used on every page)
// ============================================
exports.getBadges = async (req, res) => {
  try {
    const [pendingUsers, pendingValidations, pendingPayments] = await Promise.all([
      prisma.user.count({ where: { status: 'pending' } }),
      prisma.validationRequest.count({ where: { status: 'pending' } }),
      prisma.transaction.count({ where: { status: 'pending' } })
    ]);
    res.json({ pendingUsers, pendingValidations, pendingPayments });
  } catch (error) {
    console.error('Badges error:', error);
    res.status(500).json({ error: 'Failed to load badges' });
  }
};

// ============================================
// DASHBOARD
// ============================================
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      patients,
      psychologues,
      counselors,
      appointmentsThisMonth,
      vipSubscriptions,
      pendingValidations,
      pendingPayments,
      recentUsers,
      totalRevenue,
      usersThisMonth
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { userType: 'patient', status: 'active' } }),
      prisma.user.count({ where: { userType: 'psychologue', status: 'active' } }),
      prisma.user.count({ where: { userType: 'counselor', status: 'active' } }),
      prisma.appointment.count({ where: { appointmentDate: { gte: startOfMonth } } }),
      prisma.vIPSubscription.count({ where: { isActive: true } }),
      prisma.validationRequest.count({ where: { status: 'pending' } }),
      prisma.transaction.count({ where: { status: 'pending' } }),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullname: true,
          email: true,
          userType: true,
          status: true,
          createdAt: true,
          profile: { select: { avatar: true } }
        }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'validated' }
      }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } })
    ]);

    res.json({
      stats: {
        patientsActifs: patients,
        psychologuesActifs: psychologues,
        counselorsActifs: counselors,
        utilisateursTotaux: totalUsers,
        rdvCeMois: appointmentsThisMonth,
        revenusTotaux: totalRevenue._sum.amount || 0,
        abonnementsVIP: vipSubscriptions,
        nouveauxCeMois: usersThisMonth
      },
      pendingValidations,
      pendingPayments,
      recentUsers: recentUsers.map(u => ({
        id: u.id,
        fullname: u.fullname,
        email: u.email,
        userType: u.userType,
        status: u.status,
        avatar: u.profile?.avatar || null,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
};

// ============================================
// USERS
// ============================================
exports.getUsers = async (req, res) => {
  try {
    const { search, type, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { fullname: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (type) where.userType = type;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { profile: true }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users: users.map(u => ({
        id: u.id,
        fullname: u.fullname,
        email: u.email,
        userType: u.userType,
        status: u.status,
        avatar: u.profile?.avatar || null,
        phone: u.profile?.phone || null,
        specialite: u.profile?.specialite || null,
        createdAt: u.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('GetUsers error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { profile: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { fullname, email, userType, status, profile } = req.body;
    const userId = req.params.id;

    const userData = {};
    if (fullname !== undefined) userData.fullname = fullname;
    if (email !== undefined) userData.email = email;
    if (userType !== undefined) userData.userType = userType;
    if (status !== undefined) userData.status = status;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...userData,
        profile: profile ? {
          upsert: {
            create: profile,
            update: profile
          }
        } : undefined
      },
      include: { profile: true }
    });

    res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('UpdateUser error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'active' },
      include: { profile: true }
    });

    // If there's a pending validation request, also approve it
    await prisma.validationRequest.updateMany({
      where: { userId: req.params.id, status: 'pending' },
      data: { status: 'approved', adminId: req.user.id }
    });

    res.json({ message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'rejected' }
    });

    await prisma.validationRequest.updateMany({
      where: { userId: req.params.id, status: 'pending' },
      data: { status: 'rejected', adminId: req.user.id, rejectionReason: req.body.reason || null }
    });

    res.json({ message: 'User rejected', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject user' });
  }
};

// ============================================
// VALIDATIONS
// ============================================
exports.getValidations = async (req, res) => {
  try {
    const { type } = req.query;
    const where = { status: 'pending' };
    if (type) where.type = type;

    const validations = await prisma.validationRequest.findMany({
      where,
      include: {
        user: {
          include: { profile: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      validations: validations.map(v => ({
        id: v.id,
        userId: v.userId,
        fullname: v.user.fullname,
        email: v.user.email,
        phone: v.user.profile?.phone || null,
        type: v.type,
        specialite: v.specialite || v.user.profile?.specialite,
        universite: v.universite || v.user.profile?.universite,
        bio: v.bio || v.user.profile?.bio,
        requestDate: v.createdAt,
        avatar: v.user.profile?.avatar || null,
        documents: v.user.documents || []
      }))
    });
  } catch (error) {
    console.error('GetValidations error:', error);
    res.status(500).json({ error: 'Failed to load validations' });
  }
};

exports.approveValidation = async (req, res) => {
  try {
    const validation = await prisma.validationRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', adminId: req.user.id }
    });

    // Activate the user
    await prisma.user.update({
      where: { id: validation.userId },
      data: { status: 'active' }
    });

    res.json({ message: 'Validation approved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve validation' });
  }
};

exports.rejectValidation = async (req, res) => {
  try {
    const { reason } = req.body;
    const validation = await prisma.validationRequest.update({
      where: { id: req.params.id },
      data: { status: 'rejected', adminId: req.user.id, rejectionReason: reason || null }
    });

    await prisma.user.update({
      where: { id: validation.userId },
      data: { status: 'rejected' }
    });

    res.json({ message: 'Validation rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject validation' });
  }
};

// ============================================
// PAYMENTS
// ============================================
exports.getPaymentsSummary = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalValidated, pendingAgg, validatedAgg] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'validated', createdAt: { gte: startOfMonth } }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'pending' }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'validated' }
      })
    ]);

    const pendingCount = await prisma.transaction.count({ where: { status: 'pending' } });

    res.json({
      totalRevenue: (totalValidated._sum.amount || 0),
      pendingAmount: (pendingAgg._sum.amount || 0),
      pendingCount,
      validatedAmount: (validatedAgg._sum.amount || 0),
      currency: 'DA',
      period: 'month'
    });
  } catch (error) {
    console.error('Payments summary error:', error);
    res.status(500).json({ error: 'Failed to load payment summary' });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, fullname: true, email: true } } }
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        userName: t.user.fullname,
        userId: t.user.id,
        type: t.type,
        amount: t.amount,
        reference: t.reference,
        status: t.status,
        notes: t.notes
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('GetPayments error:', error);
    res.status(500).json({ error: 'Failed to load payments' });
  }
};

exports.validatePayment = async (req, res) => {
  try {
    await prisma.transaction.update({
      where: { id: req.params.id },
      data: {
        status: 'validated',
        validatedBy: req.user.id,
        validatedAt: new Date()
      }
    });
    res.json({ message: 'Payment validated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate payment' });
  }
};

exports.rejectPayment = async (req, res) => {
  try {
    await prisma.transaction.update({
      where: { id: req.params.id },
      data: { status: 'rejected', validatedBy: req.user.id, notes: req.body.reason || null }
    });
    res.json({ message: 'Payment rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject payment' });
  }
};

// ============================================
// STATISTICS (optimized — GROUP BY instead of N+1 loops)
// ============================================
exports.getStatistics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const now = new Date();

    // Determine how many months back to look for registrations/revenue
    let registrationMonths = 6;
    switch (period) {
      case '7d': registrationMonths = 1; break;
      case '3m': registrationMonths = 3; break;
      case '12m': registrationMonths = 12; break;
    }

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - registrationMonths, 1);

    // Phase 1 — user distribution (4 queries, parallel)
    const [patientCount, psychologueCount, counselorCount, vipCount] = await Promise.all([
      prisma.user.count({ where: { userType: 'patient', status: 'active' } }),
      prisma.user.count({ where: { userType: 'psychologue', status: 'active' } }),
      prisma.user.count({ where: { userType: 'counselor', status: 'active' } }),
      prisma.vIPSubscription.count({ where: { isActive: true } })
    ]);

    const total = patientCount + psychologueCount + counselorCount;

    // Phase 2 — monthly registrations via raw GROUP BY (1 query)
    const rawRegistrations = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('month', "createdAt") AS month,
        "userType",
        COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= $1
      GROUP BY date_trunc('month', "createdAt"), "userType"
      ORDER BY month ASC
    `, sixMonthsAgo);

    // Phase 3 — monthly revenue via raw GROUP BY (1 query)
    const rawRevenue = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('month', "createdAt") AS month,
        SUM("amount")::int AS revenue
      FROM "Transaction"
      WHERE "status" = 'validated' AND "createdAt" >= $1
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY month ASC
    `, sixMonthsAgo);

    // Phase 4 — daily appointments via raw GROUP BY (1 query)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rawAppointments = await prisma.$queryRawUnsafe(`
      SELECT
        DATE("appointmentDate") AS day,
        COUNT(*)::int AS count
      FROM "Appointment"
      WHERE "appointmentDate" >= $1
      GROUP BY DATE("appointmentDate")
      ORDER BY day ASC
    `, weekAgo);

    // Phase 5 — top 5 professionals via optimised query (1 query, no N+1)
    const rawTop = await prisma.$queryRawUnsafe(`
      SELECT
        u.id,
        u.fullname,
        u."userType",
        COALESCE(p.specialite, '-') AS specialite,
        COALESCE(p.rating, 0)::float AS rating,
        COALESCE(p.tarif, 0) AS tarif,
        COUNT(a.id)::int AS "patientCount",
        COUNT(a.id) * COALESCE(p.tarif, 0) AS revenue
      FROM "User" u
      LEFT JOIN "Profile" p ON p."userId" = u.id
      LEFT JOIN "Appointment" a ON a."doctorId" = u.id AND a.status = 'completed'
      WHERE u."userType" IN ('psychologue', 'counselor') AND u.status = 'active'
      GROUP BY u.id, u.fullname, u."userType", p.specialite, p.rating, p.tarif
      ORDER BY p.rating DESC NULLS LAST
      LIMIT 5
    `);

    // Build month labels in French
    const monthNames = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juill', 'août', 'sept', 'oct', 'nov', 'déc'];

    const registrationData = [];
    const revenueData = [];
    for (let i = 0; i < registrationMonths; i++) {
      const m = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
      const monthLabel = monthNames[m.getMonth()];
      const monthKey = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;

      const monthRegs = rawRegistrations.filter(r =>
        r.month instanceof Date
          ? r.month.getMonth() === m.getMonth() && r.month.getFullYear() === m.getFullYear()
          : String(r.month).startsWith(monthKey)
      );

      registrationData.push({
        month: monthLabel,
        patients: monthRegs.filter(r => r.userType === 'patient').reduce((s, r) => s + r.count, 0),
        psychologues: monthRegs.filter(r => r.userType === 'psychologue').reduce((s, r) => s + r.count, 0),
        counselors: monthRegs.filter(r => r.userType === 'counselor').reduce((s, r) => s + r.count, 0)
      });

      const monthRev = rawRevenue.find(r =>
        r.month instanceof Date
          ? r.month.getMonth() === m.getMonth() && r.month.getFullYear() === m.getFullYear()
          : String(r.month).startsWith(monthKey)
      );
      revenueData.push({ month: monthLabel, revenue: monthRev ? monthRev.revenue : 0 });
    }

    // Build daily appointments
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const appointmentsByDay = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const match = rawAppointments.find(r =>
        r.day instanceof Date
          ? r.day.getDate() === day.getDate() && r.day.getMonth() === day.getMonth() && r.day.getFullYear() === day.getFullYear()
          : String(r.day).startsWith(dayKey)
      );
      appointmentsByDay.push({ day: dayNames[day.getDay()], count: match ? match.count : 0 });
    }

    res.json({
      period,
      distribution: {
        patientsNormaux: total > 0 ? Math.round((patientCount - vipCount) / total * 100) : 0,
        patientsVip: total > 0 ? Math.round(vipCount / total * 100) : 0,
        psychologues: total > 0 ? Math.round(psychologueCount / total * 100) : 0,
        counselors: total > 0 ? Math.round(counselorCount / total * 100) : 0
      },
      registrations: registrationData,
      revenue: revenueData,
      appointmentsByDay,
      topProfessionals: rawTop.map(p => ({
        fullname: p.fullname,
        type: p.userType,
        specialite: p.specialite,
        patientCount: Number(p.patientCount),
        revenue: Number(p.revenue),
        rating: Number(p.rating)
      }))
    });
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
};

// ============================================
// SETTINGS
// ============================================
const DEFAULT_PLATFORM_SETTINGS = {
  siteName: 'Nebras',
  contactEmail: 'contact@nebras.dz',
  phone: '+213 XXX XXX XXX',
  consultationPrice: 1000,
  vipMonthlyPrice: 5000,
  platformCommission: 10
};

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizePositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({ data: {} });
    }
    res.json({ settings });
  } catch (error) {
    console.error('GetSettings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const dataToUpdate = {};

    const siteName = normalizeString(payload.siteName);
    const contactEmail = normalizeString(payload.contactEmail);
    const phone = normalizeString(payload.phone);
    const consultationPrice = normalizePositiveInt(payload.consultationPrice);
    const vipMonthlyPrice = normalizePositiveInt(payload.vipMonthlyPrice);
    const platformCommission = normalizePositiveInt(payload.platformCommission);

    if (siteName !== undefined) {
      if (!siteName) return res.status(400).json({ error: 'Site name is required' });
      if (siteName.length > 120) return res.status(400).json({ error: 'Site name is too long' });
      dataToUpdate.siteName = siteName;
    }

    if (contactEmail !== undefined) {
      if (!contactEmail) return res.status(400).json({ error: 'Contact email is required' });
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
      if (!isValidEmail) return res.status(400).json({ error: 'Contact email is invalid' });
      dataToUpdate.contactEmail = contactEmail;
    }

    if (phone !== undefined) {
      if (!phone) return res.status(400).json({ error: 'Phone number is required' });
      if (phone.length > 40) return res.status(400).json({ error: 'Phone number is too long' });
      dataToUpdate.phone = phone;
    }

    if (consultationPrice !== undefined) {
      if (Number.isNaN(consultationPrice) || consultationPrice <= 0) {
        return res.status(400).json({ error: 'Consultation price must be a positive number' });
      }
      dataToUpdate.consultationPrice = consultationPrice;
    }

    if (vipMonthlyPrice !== undefined) {
      if (Number.isNaN(vipMonthlyPrice) || vipMonthlyPrice <= 0) {
        return res.status(400).json({ error: 'VIP monthly price must be a positive number' });
      }
      dataToUpdate.vipMonthlyPrice = vipMonthlyPrice;
    }

    if (platformCommission !== undefined) {
      if (Number.isNaN(platformCommission) || platformCommission < 0 || platformCommission > 100) {
        return res.status(400).json({ error: 'Platform commission must be between 0 and 100' });
      }
      dataToUpdate.platformCommission = platformCommission;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ error: 'No valid settings fields were provided' });
    }

    let settings = await prisma.platformSettings.findFirst();
    const userIdRaw = req.user?.id ?? null;
    const userId = userIdRaw !== null && userIdRaw !== undefined ? String(userIdRaw) : null;

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          ...DEFAULT_PLATFORM_SETTINGS,
          ...dataToUpdate,
          updatedBy: userId
        }
      });
    } else {
      settings = await prisma.platformSettings.update({
        where: { id: settings.id },
        data: {
          ...dataToUpdate,
          updatedBy: userId
        }
      });
    }

    res.json({ message: 'Settings updated', settings });
  } catch (error) {
    console.error('UpdateSettings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
