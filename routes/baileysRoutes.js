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
} = require('../controllers/baileysController');

// Status & connection management
router.get('/status', protect, getStatus);
router.post('/connect', protect, startConnection);
router.post('/disconnect', protect, stopConnection);

// Inbox
router.get('/inbox', protect, getInbox);
router.get('/conversation/:conversationKey', protect, getConversation);
router.post('/conversation/:conversationKey/read', protect, markConversationRead);

// Send
router.post('/send-text', protect, sendText);

module.exports = router;
