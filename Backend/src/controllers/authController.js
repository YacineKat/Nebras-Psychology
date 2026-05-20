// ============================================
// AUTH CONTROLLER - Register & Login
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const asyncHandler = require('../utils/asyncHandler');

function normalizeBirthDateInput(birthDateInput) {
  if (birthDateInput === undefined || birthDateInput === null || birthDateInput === '') {
    return null;
  }

  const input = String(birthDateInput).trim();
  if (!input) return null;

  const dateOnlyMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10);
    const day = parseInt(dateOnlyMatch[3], 10);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  const parsedDate = new Date(input);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  // Normalize any datetime input to date-only semantics (UTC midnight).
  return new Date(Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate(),
    0,
    0,
    0,
    0
  ));
}

// ============================================
// REGISTER NEW USER
// ============================================
exports.register = asyncHandler(async (req, res) => {
  const { email, password, fullname, userType } = req.body;

  if (!email || !password || !fullname) {
    return res.status(400).json({ error: 'Please fill all required fields' });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const initialStatus = (userType === 'psychologue' || userType === 'counselor') ? 'pending' : 'active';

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullname,
      userType: userType || 'patient',
      status: initialStatus,
      profile: { create: {} }
    },
    include: { profile: true }
  });

  if (userType === 'psychologue' || userType === 'counselor') {
    await prisma.validationRequest.create({
      data: { userId: user.id, type: userType }
    });
  }

  const token = jwt.sign(
    { id: user.id, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.status(201).json({
    message: 'Registration successful!',
    token,
    user: {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
      userType: user.userType
    }
  });
});

// ============================================
// LOGIN USER
// ============================================
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true }
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Your account has been rejected. Contact support for more information.' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    message: 'Login successful!',
    token,
    user: {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
      userType: user.userType,
      profile: user.profile
    }
  });
});

// ============================================
// GET CURRENT USER (Profile)
// ============================================
exports.getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { profile: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user: {
    id: user.id,
    email: user.email,
    fullname: user.fullname,
    userType: user.userType,
    createdAt: user.createdAt,
    profile: user.profile || null
  }});
});

// ============================================
// UPDATE PROFILE
// ============================================
exports.updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { fullname, birthDate, gender, specialite, universite, bio, phone, adresse, diplomes, agrement, tarif, language, motifs, prefGender, prefType, avatar, isAvailable } = req.body;

  const userData = {};
  if (fullname !== undefined && fullname !== null && fullname !== '') {
    userData.fullname = fullname;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: userData
  });

  const profileData = {};

  if (avatar && avatar !== '') profileData.avatar = avatar;

  const normalizedBirthDate = normalizeBirthDateInput(birthDate);
  if (normalizedBirthDate) {
    profileData.birthDate = normalizedBirthDate;
  }

  if (gender && gender !== '') profileData.gender = gender;
  if (specialite && specialite !== '') profileData.specialite = specialite;
  if (universite && universite !== '') profileData.universite = universite;
  if (bio && bio !== '') profileData.bio = bio;
  if (phone && phone !== '') profileData.phone = phone;
  if (adresse && adresse !== '') profileData.adresse = adresse;
  if (diplomes && diplomes !== '') profileData.diplomes = diplomes;
  if (agrement && agrement !== '') profileData.agrement = agrement;
  if (tarif && tarif !== '') profileData.tarif = parseInt(tarif);

  if (isAvailable !== undefined) profileData.isAvailable = isAvailable;
  if (language && language !== '') profileData.language = language;
  if (motifs && motifs !== '') profileData.motifs = motifs;
  if (prefGender && prefGender !== '') profileData.prefGender = prefGender;
  if (prefType && prefType !== '') profileData.prefType = prefType;

  const existingProfile = await prisma.profile.findUnique({
    where: { userId }
  });

  let profile;
  if (existingProfile) {
    profile = await prisma.profile.update({
      where: { userId },
      data: profileData
    });
  } else {
    profile = await prisma.profile.create({
      data: { userId, ...profileData }
    });
  }

  res.json({
    message: 'Profile updated successfully',
    user: { ...user, profile }
  });
});

// ============================================
// LOGOUT (Client-side token removal, but we can track it)
// ============================================
exports.changePassword = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Veuillez remplir tous les champs' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caract\u00e8res' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouv\u00e9' });
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });

  res.json({ message: 'Mot de passe mis \u00e0 jour avec succ\u00e8s' });
});

// 