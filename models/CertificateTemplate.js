const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['STUDENT_AWARD','GUEST_THANK_YOU','VOLUNTEER_APPRECIATION','TEAM_APPRECIATION'], required: true },
  backgroundUrl: { type: String, default: '' },
  placeholder: {
    x: { type: Number, default: 40 },
    y: { type: Number, default: 40 },
    width: { type: Number, default: 160 },
    height: { type: Number, default: 160 }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
