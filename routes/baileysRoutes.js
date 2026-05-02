const router = require('express').Router();
const { protect } = require('../middleware/auth');
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
  getRules,
  saveRule,
} = require('../controllers/baileysController');

// Status & connection management
router.get('/status',      protect, getStatus);
router.post('/connect',    protect, startConnection);
router.post('/disconnect', protect, stopConnection);

// Inbox & conversations
router.get('/inbox',                               protect, getInbox);
router.get('/conversation/:conversationKey',       protect, getConversation);
router.post('/conversation/:conversationKey/read', protect, markConversationRead);

// Send
router.post('/send-text',   protect, sendText);
router.post('/send-invite', protect, sendInvitation);

// Logs
router.get('/logs', protect, getLogs);

// Auto-reply rules
router.get('/rules',     protect, getRules);
router.post('/rules',    protect, saveRule);
router.put('/rules/:id', protect, saveRule);

module.exports = router;
