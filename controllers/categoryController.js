const Category = require('../models/Category');

const normalizeCategoryType = (value) => {
  if (value === 'VOLUNTEER_TEAM') return 'VOLUNTEER_TEAM';
  return 'AWARD';
};

const getCategories = async (req, res) => {
  try {
    const filter = {};

    if (req.query.categoryType) {
      filter.categoryType = normalizeCategoryType(req.query.categoryType);
    }

    if (req.query.isActive !== undefined) {
      filter.isActive = String(req.query.isActive) === 'true';
    }

    const categories = await Category.find(filter).sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createCategory = async (req, res) => {
  try {
    const categoryType = normalizeCategoryType(req.body.categoryType);
    const isAwardCategory = categoryType === 'AWARD';

    const payload = {
      title: String(req.body.title || '').trim(),
      categoryType,

      // board is optional and hidden from form
      board: isAwardCategory ? String(req.body.board || '').trim() : '',
      className: isAwardCategory ? String(req.body.className || '').trim() : '',
      minPercentage: isAwardCategory ? Number(req.body.minPercentage || 0) : 0,
      minMarks: isAwardCategory ? Number(req.body.minMarks || 0) : 0,
      calculationMethod: isAwardCategory
        ? (req.body.calculationMethod || 'DIRECT_PERCENTAGE')
        : 'DIRECT_PERCENTAGE',
      bestOfCount: isAwardCategory ? Number(req.body.bestOfCount || 5) : 5,
      gender: isAwardCategory ? (req.body.gender || 'Any') : 'Any',
      schoolType: isAwardCategory ? (req.body.schoolType || 'Any') : 'Any',
      city: isAwardCategory ? (req.body.city || 'Any') : 'Any',
      state: isAwardCategory ? (req.body.state || 'Any') : 'Any',

      // hidden and not saved from UI now
      anchorId: null,
      backupAnchorIds: [],
      preferredGuestIds: [],

      guestMode: 'FIXED_OR_AVAILABLE',
      teamMode: req.body.teamMode || 'ROTATIONAL',
      volunteerMode: req.body.volunteerMode || 'ROTATIONAL',
      sequencePriority: Number(req.body.sequencePriority || 0),
      notes: String(req.body.notes || '').trim(),
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
    };

    if (!payload.title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const category = await Category.create(payload);
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getCategories,
  createCategory,
};