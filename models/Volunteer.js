const mongoose = require('mongoose');

const volunteerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, default: '' },
    address: { type: String, default: '' },
    mobile: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    teamOther: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    remarks: { type: String, default: '' },
    source: { type: String, default: 'PUBLIC_FORM' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Volunteer', volunteerSchema);
