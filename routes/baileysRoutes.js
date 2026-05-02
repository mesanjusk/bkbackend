const router = require('express').Router();
const { protect } = require('../middleware/auth');
const crudRoutes = require('./crudRoutes');
const BaileysAutoReplyRule = require('../models/BaileysAutoReplyRule');

const {
  getStatus,
  startConnection,
  stopConnection,
  getInbox,
  getConversation,
  markConversationRead,
  sendText,
  getLogs,
  sendInvitation,
} = require('../controllers/baileysController');

// ── Status & connection management ───────────────────────────────────────────
router.get('/status', protect, getStatus);
router.post('/connect', protect, startConnection);
router.post('/disconnect', protect, stopConnection);

// ── Inbox / conversations ─────────────────────────────────────────────────────
router.get('/inbox', protect, getInbox);
router.get('/conversation/:conversationKey', protect, getConversation);
router.post('/conversation/:conversationKey/read', protect, markConversationRead);

// ── Send ──────────────────────────────────────────────────────────────────────
router.post('/send-text', protect, sendText);

// ── Auto-reply rules (reuse generic crudRoutes on BaileysAutoReplyRule model) ─
router.use('/auto-reply-rules', crudRoutes(BaileysAutoReplyRule));

// ── Invitation blast via Baileys ──────────────────────────────────────────────
router.post('/send-invitation', protect, sendInvitation);

// ── Flat message log ──────────────────────────────────────────────────────────
router.get('/logs', protect, getLogs);

module.exports = router;
