const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Inline secret getter — avoids circular dep with authController
function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || 'change-me-in-env';
}

// ── 30-second in-memory user cache ───────────────────────────────────────────
// Stops 120+ MongoDB queries/minute from polling (baileys/status every 1-2s).
const userCache = new Map();

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > 30_000) { userCache.delete(userId); return null; }
  return entry.user;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, ts: Date.now() });
}

function invalidateCache(userId) {
  if (userId) userCache.delete(userId);
}

// ── Middleware ────────────────────────────────────────────────────────────────

async function protect(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());

    // Bootstrap hardcoded super-admin — no DB lookup, no cache
    if (decoded?.isHardcoded && decoded?.type === 'bootstrap-user') {
      req.user = {
        _id: 'hardcoded-super-admin',
        name: process.env.BOOTSTRAP_NAME || 'Super Admin',
        username: process.env.BOOTSTRAP_USERNAME || 'bootstrap-admin',
        mobile: '',
        email: '',
        isActive: true,
        isHardcoded: true,
        eventDutyType: 'SUPER_ADMIN',
        availabilityStatus: 'AVAILABLE',
        stageCounts: { anchorCalls: 0, guestAwards: 0, volunteerAssignments: 0, teamAssignments: 0 },
        roleId: { _id: 'hardcoded-role-super-admin', name: 'Super Admin', code: 'SUPER_ADMIN', permissions: ['*'] },
      };
      return next();
    }

    const userId = decoded.id;

    // Cache hit — skip DB entirely
    const cached = getCachedUser(userId);
    if (cached) {
      req.user = cached;
      return next();
    }

    // Cache miss — query DB and store
    const user = await User.findById(userId).populate('roleId');
    if (!user)        { invalidateCache(userId); return res.status(401).json({ message: 'Invalid token user' }); }
    if (!user.isActive) { invalidateCache(userId); return res.status(403).json({ message: 'User account is inactive' }); }

    setCachedUser(userId, user);
    req.user = user;
    return next();

  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function permit(permission) {
  return (req, res, next) => {
    const permissions = req.user?.roleId?.permissions || [];
    if (permissions.includes('*')) return next();
    if (!permissions.includes(permission)) return res.status(403).json({ message: 'Permission denied' });
    return next();
  };
}

module.exports = { protect, permit, invalidateCache };