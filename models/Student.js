const mongoose = require('mongoose');
const crypto = require('crypto');

const subjectSchema = new mongoose.Schema(
  {
    subject: { type: String, default: '' },
    marksObtained: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 100 }
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, default: 'Any' },
    address: { type: String, default: '' },

    mobile: { type: String, required: true, trim: true },
    parentMobile: { type: String, required: true, trim: true },

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    categoryOther: { type: String, default: '' },

    schoolName: { type: String, default: '' },
    className: { type: String, default: '' },
    percentage: { type: Number, default: 0 },
    subjects: { type: [subjectSchema], default: [] },

    marksheetFileUrl: { type: String, default: '' },
    resultImageUrl: { type: String, default: '' },
    studentPhotoUrl: { type: String, default: '' },
    certificatePhotoUrl: { type: String, default: '' },

    board: { type: String, default: '' },
    remarks: { type: String, default: '' },

    rawExtractedText: { type: String, default: '' },
    extractionConfidence: { type: Number, default: 0 },

    certificateAdjustments: {
      photoScale: { type: Number, default: 1 },
      photoX: { type: Number, default: 0 },
      photoY: { type: Number, default: 0 },
      photoRotation: { type: Number, default: 0 }
    },

    matchedCategoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    publicEditToken: { type: String, index: true, default: '' },
    whatsappConfirmationSentAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Eligible', 'Selected', 'Rejected', 'Review Needed'],
      default: 'Pending'
    }
  },
  { timestamps: true }
);

studentSchema.pre('validate', function (next) {
  if (!this.publicEditToken) {
    this.publicEditToken = crypto.randomBytes(24).toString('hex');
  }
  if (!this.certificatePhotoUrl && this.studentPhotoUrl) {
    this.certificatePhotoUrl = this.studentPhotoUrl;
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);