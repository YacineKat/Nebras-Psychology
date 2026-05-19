const prisma = require('../prisma');

exports.createReview = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctorId, appointmentId, rating, comment } = req.body;

    if (req.user.userType !== 'patient') {
      return res.status(403).json({ error: 'Seuls les patients peuvent évaluer' });
    }

    if (!doctorId || !appointmentId || !rating) {
      return res.status(400).json({ error: 'doctorId, appointmentId et rating requis' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La note doit être entre 1 et 5' });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment || appointment.patientId !== patientId) {
      return res.status(404).json({ error: 'Rendez-vous introuvable' });
    }

    if (appointment.status !== 'completed' && appointment.status !== 'confirmed') {
      return res.status(400).json({ error: 'Seuls les rendez-vous terminés peuvent être évalués' });
    }

    const existing = await prisma.review.findUnique({
      where: {
        patientId_doctorId_appointmentId: { patientId, doctorId, appointmentId }
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'Vous avez déjà évalué ce rendez-vous' });
    }

    const review = await prisma.review.create({
      data: { patientId, doctorId, appointmentId, rating, comment }
    });

    const stats = await prisma.review.aggregate({
      where: { doctorId },
      _avg: { rating: true },
      _count: true
    });

    const avgRating = stats._avg.rating || 0;

    await prisma.profile.updateMany({
      where: { userId: doctorId },
      data: {
        rating: Math.round(avgRating * 100) / 100,
        reviewsCount: stats._count
      }
    });

    res.status(201).json({ message: 'Évaluation enregistrée', review });
  } catch (error) {
    console.error('CreateReview error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'évaluation' });
  }
};

exports.getDoctorReviews = async (req, res) => {
  try {
    const { id } = req.params;

    const reviews = await prisma.review.findMany({
      where: { doctorId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, fullname: true, profile: { select: { avatar: true } } } }
      }
    });

    const stats = await prisma.review.aggregate({
      where: { doctorId: id },
      _avg: { rating: true },
      _count: true
    });

    res.json({
      reviews,
      averageRating: stats._avg.rating || 0,
      totalReviews: stats._count
    });
  } catch (error) {
    console.error('GetDoctorReviews error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des avis' });
  }
};
