const mongoose = require('mongoose');

const stageAssignmentSchema = new mongoose.Schema({
  sequenceNo: { type: Number, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  plannedAnchorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actualAnchorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  plannedGuestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actualGuestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teamMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  volunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: {
    type: String,
    enum: ['PENDING', 'CALLED', 'ON_STAGE', 'COMPLETED', 'SKIPPED', 'REASSIGNED'],
    default: 'PENDING'
  },
  changeReason: { type: String, default: '' },
  calledByAnchor: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('StageAssignment', stageAssignmentSchema);
