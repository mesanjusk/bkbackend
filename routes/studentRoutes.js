const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getStudents, createStudent, evaluateStudent } = require('../controllers/studentController');

router.get('/', protect, getStudents);
router.post('/', protect, createStudent);
router.post('/:id/evaluate', protect, evaluateStudent);

module.exports = router;
