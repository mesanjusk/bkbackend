const mongoose = require('mongoose');
const Volunteer = require('../models/Volunteer');
const Category = require('../models/Category');
const { emitEvent } = require('../services/socket');

function buildFullName(body = {}) {
  return [body.firstName, body.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

async function getPublicTeams(req, res) {
  try {
    const docs = await Category.find({ categoryType: 'VOLUNTEER_TEAM', isActive: true })
      .select('_id title categoryType')
      .sort({ title: 1 });
    res.json(docs.map((item) => ({ _id: item._id, name: item.title, categoryType: item.categoryType })));
  } catch (error) {
    console.error('getPublicTeams error:', error);
    res.status(500).json({ message: 'Failed to fetch volunteer teams' });
  }
}

async function createPublicVolunteer(req, res) {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const fullName = String(req.body.fullName || buildFullName(req.body)).trim();
    const mobile = String(req.body.mobile || '').trim();
    const teamId = String(req.body.teamId || '').trim();
    const teamOther = String(req.body.teamOther || '').trim();

    if (!firstName || !lastName || !mobile) {
      return res.status(400).json({ message: 'First name, last name and mobile are required' });
    }

    if (!teamId && !teamOther) {
      return res.status(400).json({ message: 'Volunteer team category is required' });
    }

    let resolvedTeamId = null;
    if (teamId) {
      if (!mongoose.Types.ObjectId.isValid(teamId)) {
        return res.status(400).json({ message: 'Invalid volunteer team category' });
      }
      const team = await Category.findById(teamId);
      if (!team) {
        return res.status(400).json({ message: 'Volunteer team category not found' });
      }
      resolvedTeamId = team._id;
    }

    const doc = await Volunteer.create({
      firstName,
      lastName,
      fullName,
      gender: String(req.body.gender || '').trim(),
      address: String(req.body.address || '').trim(),
      mobile,
      teamId: resolvedTeamId,
      teamOther: resolvedTeamId ? '' : teamOther,
      photoUrl: String(req.body.photoUrl || '').trim(),
      remarks: String(req.body.remarks || '').trim()
    });

    emitEvent('volunteer_public_registered', { volunteerId: doc._id, fullName: doc.fullName });
    res.status(201).json({ message: 'Volunteer registration submitted successfully' });
  } catch (error) {
    console.error('createPublicVolunteer error:', error);
    res.status(500).json({ message: error.message || 'Failed to submit volunteer registration' });
  }
}

module.exports = { getPublicTeams, createPublicVolunteer };
