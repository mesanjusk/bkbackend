const express = require('express');
const { getCategories, createCategory } = require('../controllers/categoryController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, getCategories);
router.post('/', protect, createCategory);

module.exports = router;
