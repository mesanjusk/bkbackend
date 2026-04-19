const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { summary } = require('../controllers/dashboardController');

router.get('/summary', protect, summary);

module.exports = router;
