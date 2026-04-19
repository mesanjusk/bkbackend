const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getAssignments, createAssignment, generateAssignmentsFromEligible, updateStatus, changeGuest, liveBoard } = require('../controllers/stageController');

router.get('/', protect, getAssignments);
router.get('/live-board', protect, liveBoard);
router.post('/', protect, createAssignment);
router.post('/generate-from-eligible', protect, generateAssignmentsFromEligible);
router.post('/:id/change-guest', protect, changeGuest);
router.post('/:id/status', protect, updateStatus);

module.exports = router;
