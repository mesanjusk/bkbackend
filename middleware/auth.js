const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function protect(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Temporary hardcoded bootstrap user support
    if (decoded?.isHardcoded && decoded?.type === 'bootstrap-user') {
      req.user = {
        _id: 'hardcoded-super-admin',
        name: 'Sanju',
        username: process.env.BOOTSTRAP_USERNAME || 'sanju',
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
      };
      return next();
    }

    const user = await User.findById(decoded.id).populate('roleId');
    if (!user) {
      return res.status(401).json({ message: 'Invalid token user' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'User account is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function permit(permission) {
  return (req, res, next) => {
    const permissions = req.user?.roleId?.permissions || [];

    if (permissions.includes('*')) {
      return next();
    }

    if (!permissions.includes(permission)) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    next();
  };
}

module.exports = { protect, permit };