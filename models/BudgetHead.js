const mongoose = require('mongoose');

const budgetHeadSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  allowedBudget: { type: Number, default: 0 },
  expectedCost: { type: Number, default: 0 },
  actualExpense: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  responsibleTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  responsibleUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('BudgetHead', budgetHeadSchema);
