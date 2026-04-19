const Student = require('../models/Student');
const Category = require('../models/Category');
const { doesMatch, getCalculatedPercentage } = require('../services/matchService');
const { emitEvent } = require('../services/socket');

async function getStudents(req, res) {
  const docs = await Student.find().populate('matchedCategoryIds').sort({ createdAt: -1 });
  res.json(docs);
}

async function createStudent(req, res) {
  const payload = { ...req.body };
  if ((!payload.percentage || payload.percentage === 0) && Array.isArray(payload.subjects) && payload.subjects.length) {
    payload.percentage = Number(getCalculatedPercentage(payload, { calculationMethod: payload.board === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE', bestOfCount: 5 }).toFixed(2));
  }
  const doc = await Student.create(payload);
  emitEvent('student_form_submitted', { studentId: doc._id, fullName: doc.fullName });
  res.status(201).json(doc);
}

async function updateStudent(req, res) {
  const doc = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('matchedCategoryIds');
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
    student.percentage = Number(getCalculatedPercentage(student, { calculationMethod: student.board === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE', bestOfCount: 5 }).toFixed(2));
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
  student.matchedCategoryIds = matched.map(x => x._id);
  student.status = matched.length ? 'Eligible' : 'Review Needed';
  await student.save();
  const updated = await Student.findById(student._id).populate('matchedCategoryIds');
  emitEvent('student_eligible', { studentId: updated._id, matchedCount: matched.length, status: updated.status });
  res.json(updated);
}

module.exports = { getStudents, createStudent, updateStudent, parseStudent, evaluateStudent };
