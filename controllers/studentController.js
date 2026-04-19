const Student = require('../models/Student');
const Category = require('../models/Category');
const { doesMatch } = require('../services/matchService');
const { emitEvent } = require('../services/socket');

async function getStudents(req, res) {
  const docs = await Student.find().populate('matchedCategoryIds').sort({ createdAt: -1 });
  res.json(docs);
}

async function createStudent(req, res) {
  const doc = await Student.create(req.body);
  emitEvent('student_form_submitted', { studentId: doc._id, fullName: doc.fullName });
  res.status(201).json(doc);
}

async function evaluateStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const categories = await Category.find({ isActive: true });
  const matched = categories.filter((cat) => doesMatch(student, cat));
  student.matchedCategoryIds = matched.map(x => x._id);
  student.status = matched.length ? 'Eligible' : 'Pending';
  await student.save();

  const updated = await Student.findById(student._id).populate('matchedCategoryIds');
  emitEvent('student_eligible', { studentId: updated._id, matchedCount: matched.length, status: updated.status });
  res.json(updated);
}

module.exports = { getStudents, createStudent, evaluateStudent };
