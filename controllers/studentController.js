const mongoose = require('mongoose');
const Student = require('../models/Student');
const Category = require('../models/Category');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Notification = require('../models/Notification');
const { doesMatch, getCalculatedPercentage } = require('../services/matchService');
const { emitEvent } = require('../services/socket');
const { sendTemplateMessage, sendTextMessage } = require('../services/whatsappService');

function getBoardFromCategory(category) {
  if (!category) return '';
  if (category.board) return category.board;
  const title = String(category.title || '').toUpperCase();
  if (title.includes('CBSE')) return 'CBSE';
  if (title.includes('STATE')) return 'STATE BOARD';
  return '';
}

function calculatePercentIfNeeded(payload, categoryBoard = '') {
  const next = { ...payload };
  const boardForCalc = String(next.board || categoryBoard || '').toUpperCase();

  if ((!next.percentage || Number(next.percentage) === 0) && Array.isArray(next.subjects) && next.subjects.length) {
    next.percentage = Number(
      getCalculatedPercentage(next, {
        calculationMethod: boardForCalc === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE',
        bestOfCount: 5
      }).toFixed(2)
    );
  }

  return next;
}

function normalizeStudentPayload(body, board = '') {
  const payload = {
    ...body,
    board,
    resultImageUrl: body.resultImageUrl || body.marksheetFileUrl || ''
  };

  if (payload.categoryId === 'OTHER' || payload.categoryId === '') {
    payload.categoryId = null;
    payload.categoryOther = String(payload.categoryOther || 'OTHER').trim();
  } else if (payload.categoryId) {
    if (!mongoose.Types.ObjectId.isValid(payload.categoryId)) {
      const error = new Error('Invalid categoryId');
      error.statusCode = 400;
      throw error;
    }
  } else {
    payload.categoryId = null;
  }

  if (!payload.categoryOther) {
    payload.categoryOther = '';
  }

  if (payload.studentPhotoUrl && !payload.certificatePhotoUrl) {
    payload.certificatePhotoUrl = payload.studentPhotoUrl;
  }

  return calculatePercentIfNeeded(payload, board);
}

async function queueStudentConfirmation(student) {
  if (!student.mobile) return;

  const editLink = `${process.env.CLIENT_URL || 'https://bkawards.instify.in'}/student-edit/${student.publicEditToken}`;

  await sendTemplateMessage({
    to: student.mobile,
    templateName: 'bk_awards',
    languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
    bodyParameters: [student.fullName]
  });

  await WhatsAppMessage.create({
    to: student.mobile,
    templateName: 'bk_awards',
    messageType: 'TEMPLATE',
    status: 'SENT',
    relatedEntityType: 'Student',
    relatedEntityId: String(student._id),
    bodyText: `Hello ${student.fullName}, Your Registration for BK Scholar Awards 2026 has been successfully submitted. We will share further updates with you on WhatsApp. Badte Kadam, Gondia`
  });

  await sendTextMessage({
    to: student.mobile,
    body:
      `Your secure edit link for BK Scholar Awards 2026:\n${editLink}\n\n` +
      `Use this link only if you want to update your form later.`
  });

  await WhatsAppMessage.create({
    to: student.mobile,
    templateName: 'student_edit_link',
    messageType: 'TEXT',
    status: 'SENT',
    relatedEntityType: 'Student',
    relatedEntityId: String(student._id),
    bodyText: `Secure edit link shared to ${student.fullName}`
  });

  await Notification.create({
    title: 'Student confirmation sent',
    message: `Registration confirmation sent for ${student.fullName}`,
    type: 'WHATSAPP',
    targetRoles: ['ADMIN', 'SENIOR_TEAM']
  });

  student.whatsappConfirmationSentAt = new Date();
  await student.save();

  emitEvent('whatsapp_message_logged', { to: student.mobile, studentId: student._id });
}

async function getPublicCategories(req, res) {
  const docs = await Category.find({ isActive: true })
    .select('_id title board className minPercentage')
    .sort({ createdAt: -1 });

  res.json(docs);
}

async function getStudents(req, res) {
  const docs = await Student.find()
    .populate('matchedCategoryIds')
    .populate('categoryId')
    .sort({ createdAt: -1 });

  res.json(docs);
}

async function createStudent(req, res) {
  try {
    let category = null;

    if (req.body.categoryId && req.body.categoryId !== 'OTHER') {
      category = await Category.findById(req.body.categoryId);
    }

    const board = getBoardFromCategory(category);
    const payload = normalizeStudentPayload(req.body, board);

    const doc = await Student.create(payload);
    emitEvent('student_form_submitted', { studentId: doc._id, fullName: doc.fullName });

    res.status(201).json(doc);
  } catch (error) {
    console.error('createStudent error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to create student'
    });
  }
}

async function createPublicStudent(req, res) {
  try {
    let category = null;

    if (req.body.categoryId && req.body.categoryId !== 'OTHER') {
      category = await Category.findById(req.body.categoryId);
    }

    const board = getBoardFromCategory(category);
    const payload = normalizeStudentPayload(req.body, board);

    const doc = await Student.create(payload);
    await queueStudentConfirmation(doc);

    emitEvent('student_public_registered', { studentId: doc._id, fullName: doc.fullName });

    res.status(201).json({
      message: 'Registration submitted successfully'
    });
  } catch (error) {
    console.error('createPublicStudent error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to submit registration'
    });
  }
}

async function getPublicStudentByToken(req, res) {
  try {
    const doc = await Student.findOne({ publicEditToken: req.params.token })
      .populate('matchedCategoryIds')
      .populate('categoryId');

    if (!doc) return res.status(404).json({ message: 'Student form not found' });

    res.json(doc);
  } catch (error) {
    console.error('getPublicStudentByToken error:', error);
    res.status(500).json({ message: 'Failed to fetch student form' });
  }
}

async function updatePublicStudentByToken(req, res) {
  try {
    let category = null;

    if (req.body.categoryId && req.body.categoryId !== 'OTHER') {
      category = await Category.findById(req.body.categoryId);
    } else {
      const existing = await Student.findOne({ publicEditToken: req.params.token }).populate('categoryId');
      category = existing?.categoryId || null;
    }

    const board = getBoardFromCategory(category);
    const payload = normalizeStudentPayload(req.body, board);

    const doc = await Student.findOneAndUpdate(
      { publicEditToken: req.params.token },
      payload,
      { new: true, runValidators: true }
    )
      .populate('matchedCategoryIds')
      .populate('categoryId');

    if (!doc) return res.status(404).json({ message: 'Student form not found' });

    emitEvent('student_public_updated', { studentId: doc._id, fullName: doc.fullName });
    res.json(doc);
  } catch (error) {
    console.error('updatePublicStudentByToken error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update student form'
    });
  }
}

async function updateStudent(req, res) {
  try {
    let category = null;

    if (req.body.categoryId && req.body.categoryId !== 'OTHER') {
      category = await Category.findById(req.body.categoryId);
    } else {
      const existing = await Student.findById(req.params.id).populate('categoryId');
      category = existing?.categoryId || null;
    }

    const board = getBoardFromCategory(category);
    const payload = normalizeStudentPayload(req.body, board);

    const doc = await Student.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    })
      .populate('matchedCategoryIds')
      .populate('categoryId');

    if (!doc) return res.status(404).json({ message: 'Student not found' });

    res.json(doc);
  } catch (error) {
    console.error('updateStudent error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update student'
    });
  }
}

async function parseStudent(req, res) {
  try {
    const student = await Student.findById(req.params.id).populate('categoryId');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    student.status = 'Processing';
    student.rawExtractedText =
      student.rawExtractedText ||
      `Parsed placeholder for ${student.fullName} / ${student.board} / ${student.className}`;
    student.extractionConfidence = student.extractionConfidence || 0.91;

    const board = getBoardFromCategory(student.categoryId);
    if ((!student.percentage || student.percentage === 0) && Array.isArray(student.subjects) && student.subjects.length) {
      student.percentage = Number(
        getCalculatedPercentage(student, {
          calculationMethod: String(board).toUpperCase() === 'CBSE' ? 'BEST_5' : 'DIRECT_PERCENTAGE',
          bestOfCount: 5
        }).toFixed(2)
      );
    }

    await student.save();
    emitEvent('student_parsed', { studentId: student._id, confidence: student.extractionConfidence });
    res.json(student);
  } catch (error) {
    console.error('parseStudent error:', error);
    res.status(500).json({ message: 'Failed to parse student' });
  }
}

async function evaluateStudent(req, res) {
  try {
    const student = await Student.findById(req.params.id).populate('categoryId');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const categories = await Category.find({ isActive: true });
    const matched = categories.filter((cat) => doesMatch(student, cat));

    student.matchedCategoryIds = matched.map((x) => x._id);
    student.status = matched.length ? 'Eligible' : 'Review Needed';
    await student.save();

    const updated = await Student.findById(student._id)
      .populate('matchedCategoryIds')
      .populate('categoryId');

    emitEvent('student_eligible', {
      studentId: updated._id,
      matchedCount: matched.length,
      status: updated.status
    });

    res.json(updated);
  } catch (error) {
    console.error('evaluateStudent error:', error);
    res.status(500).json({ message: 'Failed to evaluate student' });
  }
}

module.exports = {
  getPublicCategories,
  getStudents,
  createStudent,
  createPublicStudent,
  getPublicStudentByToken,
  updatePublicStudentByToken,
  updateStudent,
  parseStudent,
  evaluateStudent
};