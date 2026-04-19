const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getAssignments, createAssignment, changeGuest } = require('../controllers/stageController');

router.get('/', protect, getAssignments);
router.post('/', protect, createAssignment);
router.post('/:id/change-guest', protect, changeGuest);

module.exports = router;
