const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  to: { type: String, default: '' },
  from: { type: String, default: '' },
  contactName: { type: String, default: '' },
  conversationKey: { type: String, index: true, default: '' },
  waMessageId: { type: String, default: '', index: true, sparse: true },
  replyToMessageId: { type: String, default: '' },
  direction: { type: String, enum: ['INCOMING', 'OUTGOING'], default: 'OUTGOING', index: true },
  source: { type: String, enum: ['MANUAL', 'AUTO_REPLY', 'WEBHOOK', 'SYSTEM'], default: 'MANUAL' },
  messageType: { type: String, enum: ['TEXT', 'TEMPLATE', 'MEDIA', 'INTERACTIVE', 'STATUS', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO'], default: 'TEXT' },
  templateName: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED'], default: 'SENT', index: true },
  isAutoReply: { type: Boolean, default: false },
  relatedEntityType: { type: String, default: '' },
  relatedEntityId: { type: String, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
schema.index({ conversationKey: 1, createdAt: -1 });
module.exports = mongoose.model('WhatsAppMessage', schema);
