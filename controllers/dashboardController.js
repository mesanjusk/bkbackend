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

async function summary(req, res) {
  const [roles, users, events, categories, students, stageAssignments, donations, notifications, budgetHeads, vendors, expenses, tasks, teams] = await Promise.all([
    Role.countDocuments(),
    User.countDocuments(),
    Event.countDocuments(),
    Category.countDocuments(),
    Student.countDocuments(),
    StageAssignment.countDocuments(),
    Donation.countDocuments(),
    Notification.countDocuments(),
    BudgetHead.countDocuments(),
    Vendor.countDocuments(),
    Expense.countDocuments(),
    EventTask.countDocuments(),
    Team.countDocuments()
  ]);

  const [allowedAgg, actualAgg] = await Promise.all([
    BudgetHead.aggregate([{ $group: { _id: null, totalAllowed: { $sum: '$allowedBudget' }, totalExpected: { $sum: '$expectedCost' } } }]),
    Expense.aggregate([{ $group: { _id: null, totalActual: { $sum: '$amount' } } }])
  ]);

  const [latestEvent, pendingTasks, availableGuests, liveAssignments, reviewStudents, eligibleStudents] = await Promise.all([
    Event.findOne().sort({ createdAt: -1 }),
    EventTask.countDocuments({ status: { $ne: 'DONE' } }),
    User.countDocuments({ eventDutyType: 'GUEST', availabilityStatus: { $in: ['AVAILABLE', 'ARRIVED_EARLY', 'EXPECTED'] } }),
    StageAssignment.countDocuments({ status: { $in: ['CALLED', 'ON_STAGE', 'REASSIGNED'] } }),
    Student.countDocuments({ status: 'Review Needed' }),
    Student.countDocuments({ status: 'Eligible' })
  ]);

  res.json({
    roles, users, events, categories, students, stageAssignments, donations, notifications,
    budgetHeads, vendors, expenses, tasks, teams,
    totalAllowedBudget: allowedAgg?.[0]?.totalAllowed || 0,
    totalExpectedCost: allowedAgg?.[0]?.totalExpected || 0,
    totalActualExpense: actualAgg?.[0]?.totalActual || 0,
    eligibleStudents,
    reviewStudents,
    pendingTasks,
    availableGuests,
    liveAssignments,
    currentUserRole: req.user.roleId?.name || '',
    currentUserRoleCode: req.user.roleId?.code || '',
    currentUserDuty: req.user.eventDutyType || 'NONE',
    latestEvent
  });
}

module.exports = { summary };
