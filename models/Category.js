const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  board: { type: String, default: '' },
  className: { type: String, default: '' },
  minPercentage: { type: Number, default: 0 },
  minMarks: { type: Number, default: 0 },
  calculationMethod: { type: String, enum: ['DIRECT_PERCENTAGE', 'BEST_5'], default: 'DIRECT_PERCENTAGE' },
  bestOfCount: { type: Number, default: 5 },
  gender: { type: String, default: 'Any' },
  schoolType: { type: String, default: 'Any' },
  city: { type: String, default: 'Any' },
  state: { type: String, default: 'Any' },
  anchorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  backupAnchorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  preferredGuestIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  guestMode: { type: String, enum: ['FIXED_OR_AVAILABLE', 'ROTATIONAL', 'MANUAL'], default: 'FIXED_OR_AVAILABLE' },
  teamMode: { type: String, enum: ['ROTATIONAL', 'FIXED', 'MANUAL'], default: 'ROTATIONAL' },
  volunteerMode: { type: String, enum: ['ROTATIONAL', 'FIXED', 'MANUAL'], default: 'ROTATIONAL' },
  sequencePriority: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
