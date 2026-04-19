const StageAssignment = require('../models/StageAssignment');
const User = require('../models/User');
const Category = require('../models/Category');
const { emitEvent } = require('../services/socket');

async function getAssignments(req, res) {
  const docs = await StageAssignment.find()
    .populate('studentId categoryId plannedAnchorId actualAnchorId plannedGuestId actualGuestId teamMemberId volunteerId')
    .sort({ sequenceNo: 1 });
  res.json(docs);
}

async function createAssignment(req, res) {
  const category = await Category.findById(req.body.categoryId);
  const payload = { ...req.body };
  if (category && category.anchorId && !payload.plannedAnchorId) {
    payload.plannedAnchorId = category.anchorId;
    payload.actualAnchorId = category.anchorId;
  }
  const doc = await StageAssignment.create(payload);
  const populated = await StageAssignment.findById(doc._id)
    .populate('studentId categoryId plannedAnchorId actualAnchorId plannedGuestId actualGuestId teamMemberId volunteerId');
  emitEvent('stage_assignment_updated', populated);
  res.status(201).json(populated);
}

async function changeGuest(req, res) {
  const { actualGuestId, changeReason } = req.body;
  const doc = await StageAssignment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Assignment not found' });
  doc.actualGuestId = actualGuestId;
  doc.changeReason = changeReason || 'Updated by senior team';
  if (doc.status === 'PENDING') doc.status = 'REASSIGNED';
  await doc.save();
  const populated = await StageAssignment.findById(doc._id)
    .populate('studentId categoryId plannedAnchorId actualAnchorId plannedGuestId actualGuestId teamMemberId volunteerId');
  emitEvent('guest_changed', populated);
  emitEvent('anchor_popup', {
    assignmentId: populated._id,
    title: `Guest changed for ${populated.categoryId?.title || 'Category'}`,
    message: `New guest assigned for sequence ${populated.sequenceNo}`
  });
  res.json(populated);
}

module.exports = { getAssignments, createAssignment, changeGuest };
