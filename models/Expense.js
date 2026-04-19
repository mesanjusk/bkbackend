const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  expenseType: { type: String, enum: ['VENDOR','DIRECT','EMERGENCY','TEAM_PURCHASE'], default: 'DIRECT' },
  amount: { type: Number, required: true, default: 0 },
  paymentMode: { type: String, enum: ['CASH','UPI','CHEQUE','BANK','OTHER'], default: 'CASH' },
  budgetHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'BudgetHead', default: null },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  paidByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['PENDING','APPROVED','PAID'], default: 'PAID' },
  note: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
