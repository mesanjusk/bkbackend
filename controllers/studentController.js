const mongoose = require('mongoose');
const Student = require('../models/Student');
const Category = require('../models/Category');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const BaileysMessage = require('../models/BaileysMessage');
const Notification = require('../models/Notification');
const { doesMatch, getCalculatedPercentage } = require('../services/matchService');
const { emitEvent } = require('../services/socket');
const { sendTemplateMessage } = require('../services/whatsappService');
const baileysService = require('../services/baileysService');
const { getSettingValue } = require('./systemSettingsController');

function getBoardFromCategory(category) {
  if (!category) return '';
  if (category.board) return category.board;

  const title = String(category.title || '').toUpperCase();
  if (title.includes('CBSE')) return 'CBSE';
  if (title.includes('STATE')) return 'STATE BOARD';

  return '';
}

function buildFullName(body = {}) {
  return [body.firstName, body.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
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
  const computedFullName = String(body.fullName || buildFullName(body) || '').trim();

  const payload = {
    ...body,
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    fatherName: String(body.fatherName || '').trim(),
    fullName: computedFullName,
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

  if (!payload.categoryOther) payload.categoryOther = '';
  if (!payload.gender) payload.gender = '';

  if (payload.studentPhotoUrl && !payload.certificatePhotoUrl) {
    payload.certificatePhotoUrl = payload.studentPhotoUrl;
  }

  return calculatePercentIfNeeded(payload, board);
}

// ── Phone helpers ─────────────────────────────────────────────────────────────
function normalizePhone(raw) {
  return String(raw || '').replace(/[^\d]/g, '').trim();
}

// Baileys needs a full international number (with country code).
// Indian numbers are 10 digits — prepend 91. Adjust prefix for other countries.
function toWhatsAppNumber(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return '';
  // Already has country code (11+ digits starting with 91, or 12+ digits)
  if (digits.length >= 11) return digits;
  // 10-digit Indian mobile — add 91
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// ── WhatsApp confirmation on registration ────────────────────────────────────
async function queueStudentConfirmation(student) {
  if (!student.mobile) return;

  // Read provider from DB setting — defaults to 'baileys'
  let provider = 'baileys';
  try {
    provider = await getSettingValue('registration_whatsapp_provider', 'baileys');
  } catch (e) {
    console.error('queueStudentConfirmation: could not read provider setting, using baileys', e.message);
  }

  const useBaileys = provider === 'baileys';
  const editToken = student.publicEditToken;

  // Use full international number for Baileys
  const mobileForBaileys = toWhatsAppNumber(student.mobile);

  const confirmationText =
    `Hello ${student.fullName}, ` +
    `Your registration for BK Scholar Awards 2026 has been received successfully ✅ ` +
    `We will review your details and check your eligibility for the selected category. ` +
    `Please stay connected with us on WhatsApp for further updates 📲`;

  console.log(`[queueStudentConfirmation] provider=${provider} mobile=${student.mobile} mobileForBaileys=${mobileForBaileys}`);

  try {
    if (useBaileys) {
      // ── Baileys (WhatsApp Web) ──────────────────────────────────────────
      await baileysService.sendText({ to: mobileForBaileys, body: confirmationText });

      await BaileysMessage.create({
        to: mobileForBaileys,
        from: '',
        contactName: student.fullName,
        conversationKey: mobileForBaileys,
        direction: 'OUTGOING',
        source: 'AUTO',
        messageType: 'TEXT',
        bodyText: confirmationText,
        status: 'SENT',
        meta: { trigger: 'registration_confirmation', provider: 'baileys' }
      }).catch(() => null);

    } else {
      // ── Official Meta Cloud API ─────────────────────────────────────────
      await sendTemplateMessage({
        to: student.mobile,
        templateName: 'bk_award',
        languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
        bodyParameters: [student.fullName],
        buttonParameters: [
          {
            sub_type: 'url',
            index: 0,
            parameters: [{ type: 'text', text: editToken }]
          }
        ]
      });

      await WhatsAppMessage.create({
        to: student.mobile,
        templateName: 'bk_award',
        messageType: 'TEMPLATE',
        status: 'SENT',
        relatedEntityType: 'Student',
        relatedEntityId: String(student._id),
        bodyText: confirmationText
      }).catch(() => null);
    }

    await Notification.create({
      title: 'Student confirmation sent',
      message: `Registration confirmation sent for ${student.fullName} via ${useBaileys ? 'Baileys' : 'Official API'}`,
      type: 'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);

    student.whatsappConfirmationSentAt = new Date();
    await student.save();

    emitEvent('whatsapp_message_logged', { to: student.mobile, studentId: student._id });

  } catch (error) {
    console.error('queueStudentConfirmation error:', error?.response?.data || error.message || error);

    // Log failure
    if (useBaileys) {
      await BaileysMessage.create({
        to: mobileForBaileys,
        contactName: student.fullName,
        conversationKey: mobileForBaileys,
        direction: 'OUTGOING',
        source: 'AUTO',
        messageType: 'TEXT',
        bodyText: confirmationText,
        status: 'FAILED',
        meta: { trigger: 'registration_confirmation', provider: 'baileys', error: error.message }
      }).catch(() => null);
    } else {
      await WhatsAppMessage.create({
        to: student.mobile,
        templateName: 'bk_award',
        messageType: 'TEMPLATE',
        status: 'FAILED',
        relatedEntityType: 'Student',
        relatedEntityId: String(student._id),
        bodyText: `Failed to send registration confirmation to ${student.fullName}`
      }).catch(() => null);
    }

    await Notification.create({
      title: 'Student confirmation failed',
      message: `Registration confirmation failed for ${student.fullName}`,
      type: 'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);

    // Don't re-throw — registration itself succeeded, don't fail it over WhatsApp
  }
}

// ── Public categories ────────────────────────────────────────────────────────
async function getPublicCategories(req, res) {
  try {
    const docs = await Category.find({
      isActive: true,
      $or: [
        { categoryType: 'AWARD' },
        { categoryType: { $exists: false } },
        { categoryType: null },
        { categoryType: '' }
      ]
    })
      .select('_id title board className minPercentage')
      .sort({ createdAt: -1 });

    res.json(docs);
  } catch (error) {
    console.error('getPublicCategories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
}

// ── Students CRUD ─────────────────────────────────────────────────────────────
async function getStudents(req, res) {
  try {
    const docs = await Student.find()
      .populate('matchedCategoryIds')
      .populate('categoryId')
      .sort({ createdAt: -1 });

    res.json(docs);
  } catch (error) {
    console.error('getStudents error:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
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
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create student' });
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

    // Fire-and-forget — don't await so registration response is instant
    queueStudentConfirmation(doc).catch((e) =>
      console.error('queueStudentConfirmation background error:', e.message)
    );

    emitEvent('student_public_registered', { studentId: doc._id, fullName: doc.fullName });

    res.status(201).json({ message: 'Registration submitted successfully' });
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
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update student form' });
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
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update student' });
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