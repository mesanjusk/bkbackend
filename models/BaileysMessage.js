const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  to: { type: String, default: '' },
  from: { type: String, default: '' },
  contactName: { type: String, default: '' },
  conversationKey: { type: String, index: true, default: '' },
  baileysMessageId: { type: String, default: '', index: true, sparse: true },
  replyToMessageId: { type: String, default: '' },
  direction: { type: String, enum: ['INCOMING', 'OUTGOING'], default: 'OUTGOING', index: true },
  source: { type: String, enum: ['MANUAL', 'AUTO_REPLY', 'WEBHOOK', 'SYSTEM'], default: 'MANUAL' },
  messageType: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'TEMPLATE', 'MEDIA'], default: 'TEXT' },
  bodyText: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED'], default: 'SENT', index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

schema.index({ conversationKey: 1, createdAt: -1 });
module.exports = mongoose.model('BaileysMessage', schema);
