const Student = require('../models/Student');
const Category = require('../models/Category');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Notification = require('../models/Notification');
const { doesMatch, getCalculatedPercentage } = require('../services/matchService');
const { emitEvent } = require('../services/socket');

function calculatePercentIfNeeded(payload) {
  const next = { ...payload };
  if ((!next.percentage || Number(next.percentage) === 0) && Array.isArray(next.subjects) && next.subjects.length) {
    next.percentage = Number(
      getCalculatedPercentage(next, {
        calculationMethod: next.board === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE',
        bestOfCount: 5
      }).toFixed(2)
    );
  }
  return next;
}

async function queueStudentConfirmation(student) {
  if (!student.mobile) return;
  const editLink = `${process.env.CLIENT_URL || 'https://bkfrontend.vercel.app'}/student-edit/${student.publicEditToken}`;

  await WhatsAppMessage.create({
    to: student.mobile,
    bodyText:
      `Dear ${student.fullName}, your registration has been submitted successfully.\n` +
      `You can edit your form anytime using this link:\n${editLink}`,
    templateName: 'student_registration_confirmation',
    messageType: 'TEXT',
    status: 'SENT',
    relatedEntityType: 'Student',
    relatedEntityId: String(student._id)
  });

  await Notification.create({
    title: 'Student confirmation sent',
    message: `Registration confirmation queued for ${student.fullName}`,
    type: 'WHATSAPP',
    targetRoles: ['ADMIN', 'SENIOR_TEAM']
  });

  student.whatsappConfirmationSentAt = new Date();
  await student.save();
  emitEvent('whatsapp_message_logged', { to: student.mobile, studentId: student._id });
}

async function getStudents(req, res) {
  const docs = await Student.find().populate('matchedCategoryIds').sort({ createdAt: -1 });
  res.json(docs);
}

async function createStudent(req, res) {
  const payload = calculatePercentIfNeeded(req.body);
  const doc = await Student.create(payload);
  emitEvent('student_form_submitted', { studentId: doc._id, fullName: doc.fullName });
  res.status(201).json(doc);
}

async function createPublicStudent(req, res) {
  const payload = calculatePercentIfNeeded(req.body);
  const doc = await Student.create(payload);
  await queueStudentConfirmation(doc);
  emitEvent('student_public_registered', { studentId: doc._id, fullName: doc.fullName });

  const editLink = `${process.env.CLIENT_URL || 'https://bkfrontend.vercel.app'}/student-edit/${doc.publicEditToken}`;
  res.status(201).json({
    message: 'Registration submitted successfully',
    studentId: doc._id,
    editToken: doc.publicEditToken,
    editLink
  });
}

async function getPublicStudentByToken(req, res) {
  const doc = await Student.findOne({ publicEditToken: req.params.token }).populate('matchedCategoryIds');
  if (!doc) return res.status(404).json({ message: 'Student form not found' });
  res.json(doc);
}

async function updatePublicStudentByToken(req, res) {
  const payload = calculatePercentIfNeeded(req.body);
  if (payload.studentPhotoUrl && !payload.certificatePhotoUrl) {
    payload.certificatePhotoUrl = payload.studentPhotoUrl;
  }

  const doc = await Student.findOneAndUpdate(
    { publicEditToken: req.params.token },
    payload,
    { new: true, runValidators: true }
  ).populate('matchedCategoryIds');

  if (!doc) return res.status(404).json({ message: 'Student form not found' });
  emitEvent('student_public_updated', { studentId: doc._id, fullName: doc.fullName });
  res.json(doc);
}

async function updateStudent(req, res) {
  const payload = calculatePercentIfNeeded(req.body);
  const doc = await Student.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).populate('matchedCategoryIds');
  if (!doc) return res.status(404).json({ message: 'Student not found' });
  res.json(doc);
}

async function parseStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  student.status = 'Processing';
  student.rawExtractedText = student.rawExtractedText || `Parsed placeholder for ${student.fullName} / ${student.board} / ${student.className}`;
  student.extractionConfidence = student.extractionConfidence || 0.91;

  if ((!student.percentage || student.percentage === 0) && Array.isArray(student.subjects) && student.subjects.length) {
    student.percentage = Number(
      getCalculatedPercentage(student, {
        calculationMethod: student.board === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE',
        bestOfCount: 5
      }).toFixed(2)
    );
  }

  await student.save();
  emitEvent('student_parsed', { studentId: student._id, confidence: student.extractionConfidence });
  res.json(student);
}

async function evaluateStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const categories = await Category.find({ isActive: true });
  const matched = categories.filter((cat) => doesMatch(student, cat));

  student.matchedCategoryIds = matched.map((x) => x._id);
  student.status = matched.length ? 'Eligible' : 'Review Needed';
  await student.save();

  const updated = await Student.findById(student._id).populate('matchedCategoryIds');
  emitEvent('student_eligible', { studentId: updated._id, matchedCount: matched.length, status: updated.status });
  res.json(updated);
}

module.exports = {
  getStudents,
  createStudent,
  createPublicStudent,
  getPublicStudentByToken,
  updatePublicStudentByToken,
  updateStudent,
  parseStudent,
  evaluateStudent
};