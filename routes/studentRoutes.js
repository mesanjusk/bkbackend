const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getPublicCategories,
  getStudents,
  createStudent,
  createPublicStudent,
  getPublicStudentByToken,
  updatePublicStudentByToken,
  updateStudent,
  parseStudent,
  evaluateStudent
} = require('../controllers/studentController');

router.get('/public-categories', getPublicCategories);
router.post('/public-register', createPublicStudent);
router.get('/public-edit/:token', getPublicStudentByToken);
router.put('/public-edit/:token', updatePublicStudentByToken);

router.get('/', protect, getStudents);
router.post('/', protect, createStudent);
router.put('/:id', protect, updateStudent);
router.post('/:id/parse', protect, parseStudent);
router.post('/:id/evaluate', protect, evaluateStudent);

module.exports = router;