const express = require('express');
const { getRoles, createRole } = require('../controllers/roleController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, getRoles);
router.post('/', protect, createRole);

module.exports = router;
