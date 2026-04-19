const BudgetHead = require('../models/BudgetHead');
const Vendor = require('../models/Vendor');
const Expense = require('../models/Expense');
const Donation = require('../models/Donation');
const Notification = require('../models/Notification');
const { emitEvent } = require('../services/socket');

async function refreshBudgetHead(budgetHeadId) {
  if (!budgetHeadId) return;
  const [agg] = await Expense.aggregate([
    { $match: { budgetHeadId } },
    { $group: { _id: '$budgetHeadId', total: { $sum: '$amount' } } }
  ]);
  await BudgetHead.findByIdAndUpdate(budgetHeadId, { actualExpense: agg?.total || 0 });
}

async function refreshVendor(vendorId) {
  if (!vendorId) return;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return;
  const spent = await Expense.aggregate([
    { $match: { vendorId } },
    { $group: { _id: '$vendorId', total: { $sum: '$amount' } } }
  ]);
  const totalSpent = spent?.[0]?.total || 0;
  const base = vendor.finalAmount || vendor.quotedAmount || 0;
  const dueAmount = Math.max(base - totalSpent, 0);
  let paymentStatus = 'UNPAID';
  if (totalSpent > 0 && totalSpent < base) paymentStatus = 'PARTIAL';
  if (base > 0 && totalSpent >= base) paymentStatus = 'PAID';
  await Vendor.findByIdAndUpdate(vendorId, {
    advancePaid: totalSpent,
    dueAmount,
    paymentStatus
  });
}

async function afterWrite(doc, operation) {
  if (!doc) return;
  if (doc.constructor?.modelName === 'Expense') {
    await refreshBudgetHead(doc.budgetHeadId);
    await refreshVendor(doc.vendorId);
    emitEvent('budget_updated', { budgetHeadId: doc.budgetHeadId, vendorId: doc.vendorId, operation });
  }
  if (doc.constructor?.modelName === 'Donation') {
    emitEvent('donation_added', { donationId: doc._id, amount: doc.amount, thankYouStatus: doc.thankYouStatus, operation });
    if (operation === 'create') {
      await Notification.create({
        title: 'Donation received',
        message: `Donation of ₹${doc.amount} recorded. Thank-you action pending.`,
        type: 'DONATION',
        targetRoles: ['SUPER_ADMIN', 'ADMIN', 'SENIOR_TEAM'],
        readStatus: false
      });
      emitEvent('donation_thankyou_pending', { donationId: doc._id, amount: doc.amount });
    }
  }
  if (doc.constructor?.modelName === 'Notification') {
    emitEvent('notification_created', doc);
  }
}

function list(Model, populate = '') {
  return async (req, res) => {
    const query = Model.find().sort({ createdAt: -1 });
    if (populate) query.populate(populate);
    const docs = await query;
    res.json(docs);
  };
}

function getOne(Model, populate = '') {
  return async (req, res) => {
    const query = Model.findById(req.params.id);
    if (populate) query.populate(populate);
    const doc = await query;
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  };
}

function create(Model, populate = '') {
  return async (req, res) => {
    const doc = await Model.create(req.body);
    const result = populate ? await Model.findById(doc._id).populate(populate) : doc;
    await afterWrite(result, 'create');
    res.status(201).json(result);
  };
}

function update(Model, populate = '') {
  return async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    const result = populate ? await Model.findById(doc._id).populate(populate) : doc;
    await afterWrite(result, 'update');
    res.json(result);
  };
}

function remove(Model) {
  return async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    const budgetHeadId = doc.budgetHeadId;
    const vendorId = doc.vendorId;
    await doc.deleteOne();
    if (doc.constructor?.modelName === 'Expense') {
      await refreshBudgetHead(budgetHeadId);
      await refreshVendor(vendorId);
      emitEvent('budget_updated', { budgetHeadId, vendorId, operation: 'delete' });
    }
    res.json({ success: true });
  };
}

module.exports = { list, getOne, create, update, remove };
