const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  to: { type: String, required: true },
  messageType: { type: String, enum: ['TEXT','TEMPLATE','MEDIA'], default: 'TEXT' },
  templateName: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  status: { type: String, enum: ['PENDING','SENT','FAILED'], default: 'SENT' },
  relatedEntityType: { type: String, default: '' },
  relatedEntityId: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppMessage', schema);
