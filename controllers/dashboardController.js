const Role = require('../models/Role');
const User = require('../models/User');
const Event = require('../models/Event');
const Category = require('../models/Category');
const Student = require('../models/Student');
const StageAssignment = require('../models/StageAssignment');
const Donation = require('../models/Donation');
const Notification = require('../models/Notification');
const BudgetHead = require('../models/BudgetHead');
const Vendor = require('../models/Vendor');
const Expense = require('../models/Expense');
const EventTask = require('../models/EventTask');
const Team = require('../models/Team');
const WhatsAppMessage = require('../models/WhatsAppMessage');

async function summary(req, res) {
  const [roles, users, events, categories, students, stageAssignments, donations, notifications, budgetHeads, vendors, expenses, tasks, teams, whatsappMessages] = await Promise.all([
    Role.countDocuments(), User.countDocuments(), Event.countDocuments(), Category.countDocuments(), Student.countDocuments(), StageAssignment.countDocuments(), Donation.countDocuments(), Notification.countDocuments(), BudgetHead.countDocuments(), Vendor.countDocuments(), Expense.countDocuments(), EventTask.countDocuments(), Team.countDocuments(), WhatsAppMessage.countDocuments()
  ]);
  const [{ totalAllowed = 0 } = {}, { totalActual = 0 } = {}] = await Promise.all([
    BudgetHead.aggregate([{ $group: { _id: null, totalAllowed: { $sum: '$allowedBudget' } } }]),
    Expense.aggregate([{ $group: { _id: null, totalActual: { $sum: '$amount' } } }])
  ]);
  res.json({ roles, users, events, categories, students, stageAssignments, donations, notifications, budgetHeads, vendors, expenses, tasks, teams, whatsappMessages, totalAllowedBudget: totalAllowed, totalActualExpense: totalActual, eligibleStudents: await Student.countDocuments({ status: 'Eligible' }), pendingTasks: await EventTask.countDocuments({ status: { $ne: 'DONE' } }), currentUserRole: req.user.roleId?.name || '', currentUserDuty: req.user.eventDutyType || 'NONE' });
}

module.exports = { summary };
