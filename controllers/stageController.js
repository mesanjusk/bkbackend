const StageAssignment = require('../models/StageAssignment');
const User = require('../models/User');
const Category = require('../models/Category');
const Student = require('../models/Student');
const { emitEvent } = require('../services/socket');

const populateQ = 'studentId categoryId plannedAnchorId actualAnchorId plannedGuestId actualGuestId teamMemberId volunteerId';

async function getAssignments(req, res) {
  res.json(await StageAssignment.find().populate(populateQ).sort({ sequenceNo: 1 }));
}

async function createAssignment(req, res) {
  const category = await Category.findById(req.body.categoryId).populate('preferredGuestIds');
  const payload = { ...req.body };
  if (category?.anchorId && !payload.plannedAnchorId) {
    payload.plannedAnchorId = category.anchorId;
    payload.actualAnchorId = category.anchorId;
  }
  if (!payload.plannedGuestId && category?.preferredGuestIds?.length) {
    payload.plannedGuestId = category.preferredGuestIds[0]._id;
    payload.actualGuestId = category.preferredGuestIds[0]._id;
  }
  const doc = await StageAssignment.create(payload);
  const populated = await StageAssignment.findById(doc._id).populate(populateQ);
  emitEvent('stage_assignment_updated', populated);
  res.status(201).json(populated);
}

async function generateFromEligible(req, res) {
  const students = await Student.find({ status: 'Eligible' }).sort({ createdAt: 1 });
  const categories = await Category.find().populate('preferredGuestIds');
  const existing = await StageAssignment.countDocuments();
  const created = [];
  let seq = existing + 1;
  for (const student of students) {
    if (await StageAssignment.findOne({ studentId: student._id })) continue;
    const cat = categories.find(c => student.matchedCategoryIds?.map(String).includes(String(c._id))) || categories[0];
    if (!cat) continue;
    const doc = await StageAssignment.create({
      sequenceNo: seq++,
      studentId: student._id,
      categoryId: cat._id,
      plannedAnchorId: cat.anchorId || null,
      actualAnchorId: cat.anchorId || null,
      plannedGuestId: cat.preferredGuestIds?.[0]?._id || null,
      actualGuestId: cat.preferredGuestIds?.[0]?._id || null,
      status: 'PENDING'
    });
    created.push(doc);
  }
  emitEvent('stage_assignment_updated', { generated: created.length });
  res.json({ created: created.length });
}

async function changeGuest(req, res) {
  const { actualGuestId, changeReason } = req.body;
  const doc = await StageAssignment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Assignment not found' });
  doc.actualGuestId = actualGuestId;
  doc.changeReason = changeReason || 'Updated by senior team';
  if (doc.status === 'PENDING') doc.status = 'REASSIGNED';
  await doc.save();
  const populated = await StageAssignment.findById(doc._id).populate(populateQ);
  emitEvent('guest_changed', populated);
  emitEvent('anchor_popup', {
    assignmentId: populated._id,
    title: `Guest changed for ${populated.categoryId?.title || 'Category'}`,
    message: `New guest assigned for sequence ${populated.sequenceNo}`
  });
  res.json(populated);
}

async function updateStatus(req, res) {
  const doc = await StageAssignment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Assignment not found' });
  doc.status = req.body.status || doc.status;
  if (doc.status === 'CALLED') doc.calledByAnchor = true;
  await doc.save();
  const populated = await StageAssignment.findById(doc._id).populate(populateQ);
  emitEvent('stage_assignment_updated', populated);
  res.json(populated);
}

async function liveBoard(req, res) {
  const queue = await StageAssignment.find().populate(populateQ).sort({ sequenceNo: 1 });
  const current = queue.find((q) => ['CALLED','ON_STAGE','REASSIGNED'].includes(q.status)) || queue.find((q) => q.status === 'PENDING') || null;
  const guests = await User.find({ eventDutyType: 'GUEST' }).sort({ name: 1 });
  res.json({ current, queue, guests });
}

module.exports = { getAssignments, createAssignment, generateFromEligible, changeGuest, updateStatus, liveBoard };
