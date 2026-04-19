require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Role = require('../models/Role');
const User = require('../models/User');
const Event = require('../models/Event');
const Category = require('../models/Category');
const AutomationRule = require('../models/AutomationRule');
const CertificateTemplate = require('../models/CertificateTemplate');
const Team = require('../models/Team');
const BudgetHead = require('../models/BudgetHead');
const Vendor = require('../models/Vendor');
const Expense = require('../models/Expense');
const EventTask = require('../models/EventTask');
const { PERMISSIONS } = require('../utils/permissions');

async function run() {
  await connectDB();
  await Promise.all([
    Role.deleteMany({}), User.deleteMany({}), Event.deleteMany({}), Category.deleteMany({}),
    AutomationRule.deleteMany({}), CertificateTemplate.deleteMany({}), Team.deleteMany({}),
    BudgetHead.deleteMany({}), Vendor.deleteMany({}), Expense.deleteMany({}), EventTask.deleteMany({})
  ]);

  const allPerms = Object.values(PERMISSIONS);
  const roles = await Role.insertMany([
    { name: 'Host', code: 'HOST', dashboardKey: 'host', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.notifications_view] },
    { name: 'Super Admin', code: 'SUPER_ADMIN', dashboardKey: 'super_admin', permissions: allPerms },
    { name: 'Admin', code: 'ADMIN', dashboardKey: 'admin', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.users_manage, PERMISSIONS.students_manage, PERMISSIONS.categories_manage, PERMISSIONS.stage_manage, PERMISSIONS.guest_manage, PERMISSIONS.donation_manage, PERMISSIONS.whatsapp_send, PERMISSIONS.notifications_view, PERMISSIONS.budget_manage, PERMISSIONS.expense_manage, PERMISSIONS.vendor_manage, PERMISSIONS.task_manage, PERMISSIONS.team_manage, PERMISSIONS.certificate_manage] },
    { name: 'Senior Team Member', code: 'SENIOR_TEAM', dashboardKey: 'senior_team', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.stage_manage, PERMISSIONS.guest_manage, PERMISSIONS.donation_manage, PERMISSIONS.whatsapp_send, PERMISSIONS.notifications_view, PERMISSIONS.vendor_manage, PERMISSIONS.task_manage] },
    { name: 'Team Leader', code: 'TEAM_LEADER', dashboardKey: 'team_leader', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.stage_manage, PERMISSIONS.notifications_view, PERMISSIONS.task_manage] },
    { name: 'Volunteer', code: 'VOLUNTEER', dashboardKey: 'volunteer', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.notifications_view] },
    { name: 'Guest', code: 'GUEST', dashboardKey: 'guest', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.notifications_view] },
    { name: 'Student', code: 'STUDENT', dashboardKey: 'student', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.notifications_view] },
    { name: 'Anchor', code: 'ANCHOR', dashboardKey: 'anchor', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.stage_manage, PERMISSIONS.notifications_view] },
    { name: 'Certificate Team', code: 'CERTIFICATE_TEAM', dashboardKey: 'certificate_team', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.certificate_manage, PERMISSIONS.notifications_view] },
    { name: 'Finance Team', code: 'FINANCE_TEAM', dashboardKey: 'finance_team', permissions: [PERMISSIONS.dashboard_view, PERMISSIONS.budget_manage, PERMISSIONS.expense_manage, PERMISSIONS.vendor_manage, PERMISSIONS.notifications_view] }
  ]);

  const roleByCode = Object.fromEntries(roles.map(r => [r.code, r]));

  const users = await User.insertMany([
    { name: 'Sanju', username: 'sanju', password: 'sanju', roleId: roleByCode.SUPER_ADMIN._id, eventDutyType: 'SUPER_ADMIN', mobile: '9999999999' },
    { name: 'Main Host', username: 'host1', password: 'host1', roleId: roleByCode.HOST._id, eventDutyType: 'HOST' },
    { name: 'Senior Team 1', username: 'senior1', password: 'senior1', roleId: roleByCode.SENIOR_TEAM._id, eventDutyType: 'SENIOR_TEAM' },
    { name: 'Admin 1', username: 'admin1', password: 'admin1', roleId: roleByCode.ADMIN._id, eventDutyType: 'ADMIN' },
    { name: 'Anchor 1', username: 'anchor1', password: 'anchor1', roleId: roleByCode.ANCHOR._id, eventDutyType: 'ANCHOR' },
    { name: 'Anchor 2', username: 'anchor2', password: 'anchor2', roleId: roleByCode.ANCHOR._id, eventDutyType: 'ANCHOR' },
    { name: 'Guest 1', username: 'guest1', password: 'guest1', roleId: roleByCode.GUEST._id, eventDutyType: 'GUEST', availabilityStatus: 'EXPECTED' },
    { name: 'Volunteer 1', username: 'vol1', password: 'vol1', roleId: roleByCode.VOLUNTEER._id, eventDutyType: 'VOLUNTEER' },
    { name: 'Team Leader 1', username: 'tl1', password: 'tl1', roleId: roleByCode.TEAM_LEADER._id, eventDutyType: 'TEAM_LEADER' },
    { name: 'Finance Lead', username: 'finance1', password: 'finance1', roleId: roleByCode.FINANCE_TEAM._id, eventDutyType: 'TEAM_LEADER' }
  ]);
  const userBy = Object.fromEntries(users.map(u => [u.username, u]));

  await Event.create({ eventName: 'Scholar Awards 2026', venue: 'Main Hall', organizerName: 'Host Team', description: 'Planning + live event scaffold', mode: 'PLANNING' });

  await Category.insertMany([
    { title: 'State Board Class X - Above 85%', board: 'State Board', className: 'Class X', minPercentage: 85, anchorId: userBy.anchor1._id, preferredGuestIds: [userBy.guest1._id], sequencePriority: 1 },
    { title: 'CBSE Board Class X - Above 90%', board: 'CBSE', className: 'Class X', minPercentage: 90, calculationMethod: 'BEST_5', bestOfCount: 5, anchorId: userBy.anchor2._id, preferredGuestIds: [userBy.guest1._id], sequencePriority: 2 }
  ]);

  await AutomationRule.insertMany([
    { name: 'Student form submitted', triggerKey: 'FORM_SUBMITTED', templateName: 'student_form_received', recipientType: 'Student', isActive: true },
    { name: 'Student eligible', triggerKey: 'STUDENT_ELIGIBLE', templateName: 'student_eligible', recipientType: 'Student', isActive: true },
    { name: 'Guest invitation', triggerKey: 'GUEST_INVITED', templateName: 'guest_invite', recipientType: 'Guest', isActive: true },
    { name: 'Donation thank you', triggerKey: 'DONATION_RECEIVED', templateName: 'donation_thank_you', recipientType: 'Guest', isActive: true },
    { name: 'Guest certificate', triggerKey: 'GUEST_THANK_CERT_READY', templateName: 'guest_certificate_send', recipientType: 'Guest', isActive: true }
  ]);

  await CertificateTemplate.insertMany([
    { name: 'Student Award Basic', type: 'STUDENT_AWARD' },
    { name: 'Guest Thanks Basic', type: 'GUEST_THANK_YOU' },
    { name: 'Volunteer Appreciation Basic', type: 'VOLUNTEER_APPRECIATION' }
  ]);

  const teams = await Team.insertMany([
    { name: 'Guest Management Team', code: 'GUEST_MGMT', purpose: 'Guest invitation, arrival, escort', leadUserId: userBy.senior1._id, memberUserIds: [userBy.senior1._id] },
    { name: 'Stage Management Team', code: 'STAGE_MGMT', purpose: 'Stage flow and anchor coordination', leadUserId: userBy.tl1._id, memberUserIds: [userBy.tl1._id, userBy.anchor1._id, userBy.anchor2._id] },
    { name: 'Finance & Expense Team', code: 'FINANCE', purpose: 'Budget, vendor and payments', leadUserId: userBy.finance1._id, memberUserIds: [userBy.finance1._id] },
    { name: 'Food & Hospitality Team', code: 'FOOD', purpose: 'Food, water and hospitality', leadUserId: userBy.admin1._id, memberUserIds: [userBy.admin1._id, userBy.vol1._id] },
    { name: 'Certificate & Trophy Team', code: 'CERT', purpose: 'Certificates, trophies and appreciation kits', leadUserId: userBy.admin1._id, memberUserIds: [userBy.admin1._id] }
  ]);
  const teamBy = Object.fromEntries(teams.map(t => [t.code, t]));

  const budgetHeads = await BudgetHead.insertMany([
    { title: 'Food & Snacks', code: 'FOOD', allowedBudget: 50000, expectedCost: 45000, responsibleTeamId: teamBy.FOOD._id, responsibleUserId: userBy.admin1._id },
    { title: 'Decor', code: 'DECOR', allowedBudget: 30000, expectedCost: 28000, responsibleTeamId: teamBy.STAGE_MGMT._id, responsibleUserId: userBy.tl1._id },
    { title: 'Printing', code: 'PRINT', allowedBudget: 25000, expectedCost: 24000, responsibleTeamId: teamBy.CERT._id, responsibleUserId: userBy.admin1._id },
    { title: 'Trophies & Medals', code: 'TROPHY', allowedBudget: 40000, expectedCost: 38000, responsibleTeamId: teamBy.CERT._id, responsibleUserId: userBy.admin1._id },
    { title: 'Sound & Light', code: 'SOUND', allowedBudget: 20000, expectedCost: 18000, responsibleTeamId: teamBy.STAGE_MGMT._id, responsibleUserId: userBy.tl1._id }
  ]);
  const headBy = Object.fromEntries(budgetHeads.map(b => [b.code, b]));

  const vendors = await Vendor.insertMany([
    { name: 'Royal Caterers', vendorType: 'Food Vendor', contactPerson: 'Mahesh', mobile: '9000000001', budgetHeadId: headBy.FOOD._id, responsibleTeamId: teamBy.FOOD._id, responsibleUserId: userBy.admin1._id, quotedAmount: 45000, advancePaid: 10000, dueAmount: 35000, paymentStatus: 'PARTIAL' },
    { name: 'Stage Decor House', vendorType: 'Decor Vendor', contactPerson: 'Anil', mobile: '9000000002', budgetHeadId: headBy.DECOR._id, responsibleTeamId: teamBy.STAGE_MGMT._id, responsibleUserId: userBy.tl1._id, quotedAmount: 28000, advancePaid: 5000, dueAmount: 23000, paymentStatus: 'PARTIAL' },
    { name: 'Print Point', vendorType: 'Printing Vendor', contactPerson: 'Ravi', mobile: '9000000003', budgetHeadId: headBy.PRINT._id, responsibleTeamId: teamBy.CERT._id, responsibleUserId: userBy.admin1._id, quotedAmount: 24000, advancePaid: 12000, dueAmount: 12000, paymentStatus: 'PARTIAL' }
  ]);
  const vendorBy = Object.fromEntries(vendors.map(v => [v.name, v]));

  await Expense.insertMany([
    { title: 'Food advance paid', expenseType: 'VENDOR', amount: 10000, paymentMode: 'UPI', budgetHeadId: headBy.FOOD._id, vendorId: vendorBy['Royal Caterers']._id, paidByUserId: userBy.finance1._id, approvedByUserId: userBy.sanju._id },
    { title: 'Decor advance paid', expenseType: 'VENDOR', amount: 5000, paymentMode: 'CASH', budgetHeadId: headBy.DECOR._id, vendorId: vendorBy['Stage Decor House']._id, paidByUserId: userBy.finance1._id, approvedByUserId: userBy.sanju._id },
    { title: 'Printing advance paid', expenseType: 'VENDOR', amount: 12000, paymentMode: 'BANK', budgetHeadId: headBy.PRINT._id, vendorId: vendorBy['Print Point']._id, paidByUserId: userBy.finance1._id, approvedByUserId: userBy.sanju._id }
  ]);

  await EventTask.insertMany([
    { title: 'Confirm chief guest arrival and escort', teamId: teamBy.GUEST_MGMT._id, assignedToUserId: userBy.senior1._id, backupUserId: userBy.admin1._id, priority: 'HIGH', status: 'PENDING', startTimeLabel: '5:30 PM', deadlineLabel: '6:30 PM' },
    { title: 'Check trophies and certificates table', teamId: teamBy.CERT._id, assignedToUserId: userBy.admin1._id, backupUserId: userBy.vol1._id, priority: 'HIGH', status: 'IN_PROGRESS', startTimeLabel: '4:00 PM', deadlineLabel: '6:00 PM' },
    { title: 'Coordinate dinner service timing', teamId: teamBy.FOOD._id, assignedToUserId: userBy.admin1._id, backupUserId: userBy.vol1._id, linkedVendorId: vendorBy['Royal Caterers']._id, priority: 'MEDIUM', status: 'PENDING', startTimeLabel: '7:30 PM', deadlineLabel: '9:00 PM' },
    { title: 'Mic and stage check', teamId: teamBy.STAGE_MGMT._id, assignedToUserId: userBy.tl1._id, backupUserId: userBy.anchor1._id, priority: 'HIGH', status: 'DONE', startTimeLabel: '3:00 PM', deadlineLabel: '5:00 PM' }
  ]);

  console.log('Seed complete');
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close();
  process.exit(1);
});
