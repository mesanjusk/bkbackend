const StageAssignment = require('../models/StageAssignment');
const Student = require('../models/Student');
const Category = require('../models/Category');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitEvent } = require('../services/socket');

async function populateAssignment(id) {
  return StageAssignment.findById(id)
    .populate('studentId categoryId plannedAnchorId actualAnchorId plannedGuestId actualGuestId teamMemberId volunteerId');
}

async function bumpCounts(assignment, direction = 1) {
  const ops = [];
  if (assignment.actualAnchorId) ops.push(User.findByIdAndUpdate(assignment.actualAnchorId, { $inc: { 'stageCounts.anchorCalls': direction } }));
  if (assignment.actualGuestId) ops.push(User.findByIdAndUpdate(assignment.actualGuestId, { $inc: { 'stageCounts.guestAwards': direction } }));
  if (assignment.teamMemberId) ops.push(User.findByIdAndUpdate(assignment.teamMemberId, { $inc: { 'stageCounts.teamAssignments': direction } }));
  if (assignment.volunteerId) ops.push(User.findByIdAndUpdate(assignment.volunteerId, { $inc: { 'stageCounts.volunteerAssignments': direction } }));
  await Promise.all(ops);
}

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
  if (category && category.preferredGuestIds?.length && !payload.plannedGuestId) {
    payload.plannedGuestId = category.preferredGuestIds[0];
    payload.actualGuestId = category.preferredGuestIds[0];
  }
  const doc = await StageAssignment.create(payload);
  const populated = await populateAssignment(doc._id);
  emitEvent('stage_assignment_updated', populated);
  res.status(201).json(populated);
}

async function generateAssignmentsFromEligible(req, res) {
  const students = await Student.find({ status: 'Eligible' }).populate('matchedCategoryIds').sort({ createdAt: 1 });
  const existing = await StageAssignment.find({}, 'studentId');
  const existingIds = new Set(existing.map(x => String(x.studentId)));
  let sequenceNo = (await StageAssignment.countDocuments()) + 1;
  const created = [];

  for (const student of students) {
    if (existingIds.has(String(student._id))) continue;
    const category = (student.matchedCategoryIds || []).sort((a, b) => (a.sequencePriority || 0) - (b.sequencePriority || 0))[0];
    if (!category) continue;
    const doc = await StageAssignment.create({
      sequenceNo: sequenceNo++,
      studentId: student._id,
      categoryId: category._id,
      plannedAnchorId: category.anchorId || null,
      actualAnchorId: category.anchorId || null,
      plannedGuestId: category.preferredGuestIds?.[0] || null,
      actualGuestId: category.preferredGuestIds?.[0] || null,
      status: 'PENDING'
    });
    created.push(await populateAssignment(doc._id));
  }

  emitEvent('stage_sequence_generated', { count: created.length });
  res.json({ createdCount: created.length, assignments: created });
}

async function updateStatus(req, res) {
  const { status } = req.body;
  const doc = await StageAssignment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Assignment not found' });
  const wasCompleted = doc.status === 'COMPLETED';
  doc.status = status || doc.status;
  doc.calledByAnchor = ['CALLED', 'ON_STAGE', 'COMPLETED'].includes(doc.status);
  await doc.save();
  if (!wasCompleted && doc.status === 'COMPLETED') {
    await bumpCounts(doc, 1);
  }
  const populated = await populateAssignment(doc._id);
  emitEvent('stage_assignment_updated', populated);
  res.json(populated);
}

async function changeGuest(req, res) {
  const { actualGuestId, changeReason } = req.body;
  const doc = await StageAssignment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Assignment not found' });
  doc.actualGuestId = actualGuestId;
  doc.changeReason = changeReason || 'Updated by senior team';
  if (doc.status === 'PENDING') doc.status = 'REASSIGNED';
  await doc.save();
  const populated = await populateAssignment(doc._id);
  const title = `Guest changed for ${populated.categoryId?.title || 'Category'}`;
  const message = `${populated.studentId?.fullName || 'Student'} will now receive award from ${populated.actualGuestId?.name || 'new guest'}.`;
  await Notification.create({
    title,
    message,
    type: 'GUEST_CHANGED',
    targetRoles: ['ANCHOR', 'SENIOR_TEAM', 'ADMIN', 'SUPER_ADMIN'],
    readStatus: false
  });
  emitEvent('guest_changed', populated);
  emitEvent('anchor_popup', { assignmentId: populated._id, title, message, categoryId: populated.categoryId?._id });
  res.json(populated);
}

async function liveBoard(req, res) {
  const [assignments, guests, anchors] = await Promise.all([
    StageAssignment.find().populate('studentId categoryId actualGuestId actualAnchorId teamMemberId volunteerId').sort({ sequenceNo: 1 }),
    User.find({ eventDutyType: 'GUEST' }).populate('roleId').sort({ name: 1 }),
    User.find({ eventDutyType: 'ANCHOR' }).populate('roleId').sort({ name: 1 })
  ]);
  res.json({
    assignments,
    current: assignments.find(x => ['CALLED', 'ON_STAGE'].includes(x.status)) || assignments.find(x => x.status === 'PENDING') || null,
    guests,
    anchors
  });
}

module.exports = { getAssignments, createAssignment, generateAssignmentsFromEligible, updateStatus, changeGuest, liveBoard };
