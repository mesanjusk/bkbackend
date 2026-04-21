const Category = require('../models/Category');

const normalizeCategoryType = (value) => {
  if (value === 'VOLUNTEER_TEAM') return 'VOLUNTEER_TEAM';
  return 'AWARD';
};

const buildCategoryPayload = (body = {}) => {
  const categoryType = normalizeCategoryType(body.categoryType);
  const isAwardCategory = categoryType === 'AWARD';

  return {
    title: String(body.title || '').trim(),
    categoryType,

    board: isAwardCategory ? String(body.board || '').trim() : '',
    className: isAwardCategory ? String(body.className || '').trim() : '',
    minPercentage: isAwardCategory ? Number(body.minPercentage || 0) : 0,
    minMarks: isAwardCategory ? Number(body.minMarks || 0) : 0,
    calculationMethod: isAwardCategory
      ? (body.calculationMethod || 'DIRECT_PERCENTAGE')
      : 'DIRECT_PERCENTAGE',
    bestOfCount: isAwardCategory ? Number(body.bestOfCount || 5) : 5,
    gender: isAwardCategory ? (body.gender || 'Any') : 'Any',
    schoolType: isAwardCategory ? (body.schoolType || 'Any') : 'Any',
    city: isAwardCategory ? (body.city || 'Any') : 'Any',
    state: isAwardCategory ? (body.state || 'Any') : 'Any',

    anchorId: null,
    backupAnchorIds: [],
    preferredGuestIds: [],

    guestMode: 'FIXED_OR_AVAILABLE',
    teamMode: body.teamMode || 'ROTATIONAL',
    volunteerMode: body.volunteerMode || 'ROTATIONAL',
    sequencePriority: Number(body.sequencePriority || 0),
    notes: String(body.notes || '').trim(),
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
  };
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
    const payload = buildCategoryPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const category = await Category.create(payload);
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const payload = buildCategoryPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
};