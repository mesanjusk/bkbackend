const express = require('express');
const {
  getUsers,
  createUser,
  updateUser,
  bulkImportGuests,
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getUsers);
router.post('/', protect, createUser);
router.post('/bulk-import-guests', protect, bulkImportGuests);
router.put('/:id', protect, updateUser);

module.exports = router;
