const Student = require('../models/Student');
const Category = require('../models/Category');
const { doesMatch, studentPercentageForCategory } = require('../services/matchService');
const { emitEvent } = require('../services/socket');

function parseRawText(raw = '') {
  const text = raw || '';
  const upper = text.toUpperCase();
  const board = upper.includes('CBSE') ? 'CBSE' : upper.includes('STATE') ? 'State Board' : '';
  const className = upper.includes('CLASS X') || upper.includes('STD 10') ? 'Class X' : upper.includes('CLASS XII') || upper.includes('STD 12') ? 'Class XII' : '';
  const pctMatch = text.match(/(\d{2}(?:\.\d{1,2})?)\s*%/);
  const percentage = pctMatch ? Number(pctMatch[1]) : 0;
  const confidence = [board, className, percentage].filter(Boolean).length / 3;
  return { board, className, percentage, confidence: Number((confidence * 100).toFixed(0)) };
}

async function populateStudent(id) {
  return Student.findById(id).populate('matchedCategoryIds').sort({ createdAt: -1 });
}

async function getStudents(req, res) {
  const docs = await Student.find().populate('matchedCategoryIds').sort({ createdAt: -1 });
  res.json(docs);
}

async function createStudent(req, res) {
  const payload = { ...req.body };
  if (payload.rawExtractedText && (!payload.board || !payload.className || !payload.percentage)) {
    const parsed = parseRawText(payload.rawExtractedText);
    payload.board = payload.board || parsed.board;
    payload.className = payload.className || parsed.className;
    payload.percentage = payload.percentage || parsed.percentage;
    payload.extractionConfidence = payload.extractionConfidence || parsed.confidence;
  }
  const doc = await Student.create(payload);
  emitEvent('student_form_submitted', { studentId: doc._id, fullName: doc.fullName });
  res.status(201).json(doc);
}

async function updateStudent(req, res) {
  const payload = { ...req.body };
  if (payload.rawExtractedText) {
    const parsed = parseRawText(payload.rawExtractedText);
    payload.board = payload.board || parsed.board;
    payload.className = payload.className || parsed.className;
    payload.percentage = payload.percentage || parsed.percentage;
    payload.extractionConfidence = payload.extractionConfidence || parsed.confidence;
  }
  const doc = await Student.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).populate('matchedCategoryIds');
  if (!doc) return res.status(404).json({ message: 'Student not found' });
  res.json(doc);
}

async function parseStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });
  const parsed = parseRawText(student.rawExtractedText || '');
  if (parsed.board) student.board = parsed.board;
  if (parsed.className) student.className = parsed.className;
  if (parsed.percentage) student.percentage = parsed.percentage;
  student.extractionConfidence = parsed.confidence;
  student.status = parsed.confidence >= 60 ? 'Processing' : 'Review Needed';
  await student.save();
  emitEvent('student_parsed', { studentId: student._id, confidence: student.extractionConfidence, status: student.status });
  res.json(student);
}

async function evaluateStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const categories = await Category.find({ isActive: true });
  const matched = categories.filter((cat) => doesMatch(student, cat));
  student.matchedCategoryIds = matched.map(x => x._id);
  if (student.extractionConfidence > 0 && student.extractionConfidence < 60) {
    student.status = 'Review Needed';
  } else {
    student.status = matched.length ? 'Eligible' : 'Rejected';
  }
  if (matched.length) {
    const best = matched
      .map(cat => ({ cat, score: studentPercentageForCategory(student, cat) }))
      .sort((a, b) => b.score - a.score || (a.cat.sequencePriority || 0) - (b.cat.sequencePriority || 0));
    student.remarks = `Matched ${matched.length} categories. Best fit: ${best[0]?.cat?.title || ''}`.trim();
  }
  await student.save();

  const updated = await Student.findById(student._id).populate('matchedCategoryIds');
  emitEvent('student_eligible', { studentId: updated._id, matchedCount: matched.length, status: updated.status });
  res.json(updated);
}

module.exports = { getStudents, createStudent, updateStudent, parseStudent, evaluateStudent };
