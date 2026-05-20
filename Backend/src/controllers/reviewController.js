const prisma = require('../prisma');
const asyncHandler = require('../utils/asyncHandler');

// ============================================
// SHARED: Recalculate overall doctor rating from all sources
// ============================================
async function recalculateDoctorRating(doctorId) {
  const [groupRatings, reviewRatings] = await Promise.all([
    prisma.groupSessionRating.findMany({ where: { doctorId }, select: { rating: true } }),
    prisma.review.findMany({ where: { doctorId }, select: { rating: true } })
  ]);

  const allScores = [
    ...groupRatings.map(r => r.rating),
    ...reviewRatings.map(r => r.rating)
  ];

  const avgRating = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
    : 0;

  await prisma.profile.updateMany({
    where: { userId: doctorId },
    data: {
      rating: avgRating,
      reviewsCount: reviewRatings.length
    }
  });
}

exports.createReview = asyncHandler(async (req, res) => {
  const patientId = req.user.id;
  const { doctorId, appointmentId, rating, comment } = req.body;

  if (req.user.userType !== 'patient') {
    return res.status(403).json({ error: 'Seuls les patients peuvent \u00e9valuer' });
  }

  if (!doctorId || !appointmentId || !rating) {
    return res.status(400).json({ error: 'doctorId, appointmentId et rating requis' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'La note doit \u00eatre entre 1 et 5' });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!appointment || appointment.patientId !== patientId) {
    return res.status(404).json({ error: 'Rendez-vous introuvable' });
  }

  if (appointment.status !== 'completed' && appointment.status !== 'confirmed') {
    return res.status(400).json({ error: 'Seuls les rendez-vous termin\u00e9s peuvent \u00eatre \u00e9valu\u00e9s' });
  }

  const existing = await prisma.review.findUnique({
    where: {
      patientId_doctorId_appointmentId: { patientId, doctorId, appointmentId }
    }
  });

  if (existing) {
    return res.status(409).json({ error: 'Vous avez d\u00e9j\u00e0 \u00e9valu\u00e9 ce rendez-vous' });
  }

  const review = await prisma.review.create({
    data: { patientId, doctorId, appointmentId, rating, comment }
  });

  await recalculateDoctorRating(doctorId);

  res.status(201).json({ message: '\u00c9valuation enregistr\u00e9e', review });
});

module.exports.recalculateDoctorRating = recalculateDoctorRating;
