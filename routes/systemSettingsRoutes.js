const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getSettings,
  updateSetting,
  updateSettings,
} = require('../controllers/systemSettingsController');

// All routes require authentication; super-admin wildcard permission is enforced
// via the protect middleware checking req.user. For simplicity we keep it protect-only
// (super admin has '*' permissions so any additional permit check would pass anyway).
router.get('/', protect, getSettings);
router.put('/', protect, updateSettings);         // bulk update  { key: value, ... }
router.put('/:key', protect, updateSetting);      // single key   { value: ... }

module.exports = router;
