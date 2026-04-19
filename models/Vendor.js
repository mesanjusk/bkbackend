const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  vendorType: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  mobile: { type: String, default: '' },
  address: { type: String, default: '' },
  serviceItems: { type: String, default: '' },
  budgetHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'BudgetHead', default: null },
  responsibleTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  responsibleUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  quotedAmount: { type: Number, default: 0 },
  finalAmount: { type: Number, default: 0 },
  advancePaid: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['UNPAID','PARTIAL','PAID'], default: 'UNPAID' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
