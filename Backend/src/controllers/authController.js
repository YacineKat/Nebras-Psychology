// ============================================
// AUTH CONTROLLER - Register & Login
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

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
exports.register = async (req, res) => {
  try {
    const { email, password, fullname, userType } = req.body;

    // Validation
    if (!email || !password || !fullname) {
      return res.status(400).json({ error: 'Please fill all required fields' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine initial status
    // Patients are active immediately, professionals require admin approval
    const initialStatus = (userType === 'psychologue' || userType === 'counselor') ? 'pending' : 'active';

    // Create user with profile
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullname,
        userType: userType || 'patient',
        status: initialStatus,
        profile: {
          create: {} // Empty profile initially
        }
      },
      include: {
        profile: true
      }
    });

    // Create validation request for professionals
    if (userType === 'psychologue' || userType === 'counselor') {
      await prisma.validationRequest.create({
        data: {
          userId: user.id,
          type: userType
        }
      });
    }

    // Return success (don't send password)
    res.status(201).json({
      message: 'Registration successful!',
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        userType: user.userType
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ============================================
// LOGIN USER
// ============================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter email and password' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is rejected
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Your account has been rejected. Contact support for more information.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return success
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

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ============================================
// GET CURRENT USER (Profile)
// ============================================
exports.getMe = async (req, res) => {
  try {
    console.log('getMe called, user:', req.user);
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        profile: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user.email);
    console.log('Profile:', user.profile);

    res.json({ user: {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
      userType: user.userType,
      createdAt: user.createdAt,
      profile: user.profile || null
    }});

  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ error: 'Failed to get user data: ' + error.message });
  }
};

// ============================================
// UPDATE PROFILE
// ============================================
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Updating profile for user:', userId);
    console.log('Request body:', req.body);
    
    const { fullname, birthDate, gender, specialite, universite, bio, phone, adresse, diplomes, agrement, tarif, language, motifs, prefGender, prefType, avatar } = req.body;

    // Update user name
    const userData = {};
    if (fullname !== undefined && fullname !== null && fullname !== '') {
      userData.fullname = fullname;
    }
    
    const user = await prisma.user.update({
      where: { id: userId },
      data: userData
    });
    console.log('User updated:', user.id);

    // Build profile data
    const profileData = {};
    
    // Avatar (base64 or URL)
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
    
    // Therapeutic preferences
    if (language && language !== '') profileData.language = language;
    if (motifs && motifs !== '') profileData.motifs = motifs;
    if (prefGender && prefGender !== '') profileData.prefGender = prefGender;
    if (prefType && prefType !== '') profileData.prefType = prefType;

    console.log('Profile update data:', profileData);

    // Check if profile exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId }
    });
    console.log('Existing profile:', existingProfile);

    let profile;
    if (existingProfile) {
      // Update existing profile
      profile = await prisma.profile.update({
        where: { userId },
        data: profileData
      });
    } else {
      // Create new profile
      profile = await prisma.profile.create({
        data: {
          userId,
          ...profileData
        }
      });
    }
    console.log('Profile saved:', profile.id);

    res.json({ 
      message: 'Profile updated successfully',
      user: { ...user, profile }
    });

  } catch (error) {
    console.error('UpdateProfile error:', error);
    res.status(500).json({ error: 'Failed to update profile: ' + error.message });
  }
};

// ============================================
// LOGOUT (Client-side token removal, but we can track it)
// ============================================
exports.logout = async (req, res) => {
  // In a production app, you might want to blacklist the token
  res.json({ message: 'Logout successful' });
};

// ============================================
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Veuillez remplir tous les champs' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
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

    res.json({ message: 'Mot de passe mis à jour avec succès' });

  } catch (error) {
    console.error('ChangePassword error:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
};

// 