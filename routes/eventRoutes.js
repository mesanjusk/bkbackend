const express = require('express');
const { getEvents, createEvent } = require('../controllers/eventController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, getEvents);
router.post('/', protect, createEvent);

module.exports = router;
