const jwt = require('jsonwebtoken');
const User = require('../models/User');

function generateDbToken(id) {
  return jwt.sign({ id, type: 'db-user' }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
}

function generateBootstrapToken() {
  return jwt.sign(
    {
      id: 'hardcoded-super-admin',
      username: process.env.BOOTSTRAP_USERNAME || 'sanju',
      type: 'bootstrap-user',
      isHardcoded: true,
      role: 'SUPER_ADMIN'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function login(req, res) {
  const { username, password } = req.body;

  const bootstrapUsername = process.env.BOOTSTRAP_USERNAME || 'sanju';
  const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD || 'sanju';

  // Temporary hardcoded bootstrap login
  if (username === bootstrapUsername && password === bootstrapPassword) {
    return res.json({
      token: generateBootstrapToken(),
      user: {
        _id: 'hardcoded-super-admin',
        name: 'Sanju',
        username: bootstrapUsername,
        mobile: '',
        email: '',
        isActive: true,
        isHardcoded: true,
        eventDutyType: 'SUPER_ADMIN',
        availabilityStatus: 'AVAILABLE',
        stageCounts: {
          anchorCalls: 0,
          guestAwards: 0,
          volunteerAssignments: 0,
          teamAssignments: 0
        },
        roleId: {
          _id: 'hardcoded-role-super-admin',
          name: 'Super Admin',
          code: 'SUPER_ADMIN',
          permissions: ['*']
        }
      }
    });
  }

  const user = await User.findOne({ username }).populate('roleId');
  if (!user) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: 'User account is inactive' });
  }

  const ok = await user.matchPassword(password);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  res.json({
    token: generateDbToken(user._id),
    user
  });
}

async function me(req, res) {
  res.json(req.user);
}

module.exports = { login, me };