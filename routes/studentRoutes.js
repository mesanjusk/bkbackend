const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getStudents, createStudent, updateStudent, parseStudent, evaluateStudent } = require('../controllers/studentController');

router.get('/', protect, getStudents);
router.post('/', protect, createStudent);
router.put('/:id', protect, updateStudent);
router.patch('/:id', protect, updateStudent);
router.post('/:id/parse', protect, parseStudent);
router.post('/:id/evaluate', protect, evaluateStudent);

module.exports = router;
