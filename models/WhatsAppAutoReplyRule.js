const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  matchType: { type: String, enum: ['EXACT', 'CONTAINS', 'STARTS_WITH', 'ALL'], default: 'CONTAINS' },
  triggerText: { type: String, default: '', trim: true },
  replyType: { type: String, enum: ['TEXT', 'TEMPLATE'], default: 'TEXT' },
  replyText: { type: String, default: '' },
  templateName: { type: String, default: '' },
  templateLanguage: { type: String, default: 'en_US' },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 100 },
  stopAfterMatch: { type: Boolean, default: true }
}, { timestamps: true });
schema.index({ isActive: 1, priority: 1, createdAt: -1 });
module.exports = mongoose.model('WhatsAppAutoReplyRule', schema);
