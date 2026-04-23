const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || 'change-me-in-env';
}

function canUseBootstrapLogin() {
  if (process.env.BOOTSTRAP_LOGIN_ENABLED === 'true') return true;
  if (process.env.NODE_ENV !== 'production' && process.env.BOOTSTRAP_USERNAME && process.env.BOOTSTRAP_PASSWORD) return true;
  return false;
}

function generateDbToken(id) {
  return jwt.sign({ id, type: 'db-user' }, getJwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
}

function generateBootstrapToken(username) {
  return jwt.sign(
    {
      id: 'hardcoded-super-admin',
      username,
      type: 'bootstrap-user',
      isHardcoded: true,
      role: 'SUPER_ADMIN'
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const bootstrapUsername = process.env.BOOTSTRAP_USERNAME;
    const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD;

    if (canUseBootstrapLogin() && bootstrapUsername && bootstrapPassword && username === bootstrapUsername && password === bootstrapPassword) {
      return res.json({
        token: generateBootstrapToken(bootstrapUsername),
        user: {
          _id: 'hardcoded-super-admin',
          name: process.env.BOOTSTRAP_NAME || 'Super Admin',
          username: bootstrapUsername,
          mobile: '',
          email: '',
          isActive: true,
          isHardcoded: true,
          eventDutyType: 'SUPER_ADMIN',
          availabilityStatus: 'AVAILABLE',
          stageCounts: { anchorCalls: 0, guestAwards: 0, volunteerAssignments: 0, teamAssignments: 0 },
          roleId: { _id: 'hardcoded-role-super-admin', name: 'Super Admin', code: 'SUPER_ADMIN', permissions: ['*'] }
        }
      });
    }

    const user = await User.findOne({ username }).populate('roleId');
    if (!user) return res.status(401).json({ message: 'Invalid username or password' });
    if (!user.isActive) return res.status(403).json({ message: 'User account is inactive' });

    const ok = await user.matchPassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

    return res.json({ token: generateDbToken(user._id), user });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Login failed' });
  }
}

async function me(req, res) {
  return res.json(req.user);
}

module.exports = { login, me, getJwtSecret };
