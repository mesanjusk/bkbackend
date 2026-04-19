const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { sendText } = require('../controllers/whatsappController');
const crudRoutes = require('./crudRoutes');

router.use('/connections', crudRoutes(require('../models/WhatsAppConnection')));
router.use('/templates', crudRoutes(require('../models/WhatsAppTemplate')));
router.use('/messages', crudRoutes(require('../models/WhatsAppMessage')));
router.post('/send-text', protect, sendText);

module.exports = router;
