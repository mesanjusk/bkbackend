const WhatsAppMessage = require('../models/WhatsAppMessage');
const Notification = require('../models/Notification');
const { emitEvent } = require('../services/socket');

async function sendText(req, res) {
  const { to, text, templateName } = req.body;
  const log = await WhatsAppMessage.create({ to, bodyText: text || '', templateName: templateName || '', messageType: templateName ? 'TEMPLATE' : 'TEXT', status: 'SENT' });
  await Notification.create({ title: 'WhatsApp message queued', message: `Placeholder WhatsApp ${templateName ? 'template' : 'text'} sent to ${to}`, type: 'WHATSAPP', targetRoles: ['ADMIN','SENIOR_TEAM'] });
  emitEvent('whatsapp_message_logged', log);
  emitEvent('notification_created', { type: 'WHATSAPP', to });
  res.status(201).json(log);
}

module.exports = { sendText };
