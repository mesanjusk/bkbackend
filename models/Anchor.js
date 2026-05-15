const mongoose = require('mongoose');
const crypto = require('crypto');

const anchorSchema = new mongoose.Schema(
  {
    firstName:            { type: String, default: '', trim: true },
    lastName:             { type: String, default: '', trim: true },
    fullName:             { type: String, required: true, trim: true },
    gender:               { type: String, default: '' },
    age:                  { type: Number, default: null },
    address:              { type: String, default: '' },
    mobile:               { type: String, required: true, trim: true },
    language:             { type: [String], default: [] },
    instructionsAccepted: { type: Boolean, default: true },
    editToken:            { type: String, index: true, unique: true, default: '' },
    whatsappConfirmationSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

anchorSchema.pre('validate', function (next) {
  if (!this.editToken) {
    this.editToken = crypto.randomBytes(24).toString('hex');
  }

  const builtFullName = [this.firstName, this.lastName]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if ((!this.fullName || !String(this.fullName).trim()) && builtFullName) {
    this.fullName = builtFullName;
  }

  next();
});

module.exports = mongoose.model('Anchor', anchorSchema);
