const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  mobile: { type: String, default: '' },
  email: { type: String, default: '' },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  eventDutyType: {
    type: String,
    enum: ['NONE','HOST','SUPER_ADMIN','ADMIN','SENIOR_TEAM','TEAM_LEADER','VOLUNTEER','ANCHOR','GUEST','STUDENT','CERTIFICATE_TEAM'],
    default: 'NONE'
  },
  categoriesAssigned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  availabilityStatus: {
    type: String,
    enum: ['AVAILABLE','BUSY','ON_STAGE','BREAK','NOT_AVAILABLE','LEFT_VENUE','EXPECTED','ARRIVED_EARLY'],
    default: 'AVAILABLE'
  },
  stageCounts: {
    anchorCalls: { type: Number, default: 0 },
    guestAwards: { type: Number, default: 0 },
    volunteerAssignments: { type: Number, default: 0 },
    teamAssignments: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
