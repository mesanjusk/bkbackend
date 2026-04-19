const mongoose = require('mongoose');

const eventTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  backupUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  linkedVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  priority: { type: String, enum: ['LOW','MEDIUM','HIGH'], default: 'MEDIUM' },
  status: { type: String, enum: ['PENDING','IN_PROGRESS','DONE'], default: 'PENDING' },
  startTimeLabel: { type: String, default: '' },
  deadlineLabel: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('EventTask', eventTaskSchema);
