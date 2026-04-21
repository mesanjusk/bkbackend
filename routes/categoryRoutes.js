const express = require('express');
const {
  getCategories,
  createCategory,
  updateCategory,
} = require('../controllers/categoryController');
const { protect } = require('../middleware/auth');
const Category = require('../models/Category');

const router = express.Router();

router.get('/public/volunteer-teams', async (req, res) => {
  try {
    const categories = await Category.find({
      categoryType: 'VOLUNTEER_TEAM',
      isActive: true,
    }).sort({ title: 1 });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', protect, getCategories);
router.post('/', protect, createCategory);
router.put('/:id', protect, updateCategory);

module.exports = router;