const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');

async function getUsers(req, res) {
  try {
    const filter = {};
    if (req.query.eventDutyType) {
      filter.eventDutyType = req.query.eventDutyType;
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = String(req.query.isActive) === 'true';
    }

    const users = await User.find(filter).populate('roleId').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function createUser(req, res) {
  try {
    const user = await User.create(req.body);
    const populated = await User.findById(user._id).populate('roleId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const payload = { ...req.body };
    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    } else {
      delete payload.password;
    }

    const updated = await User.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).populate('roleId');

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function bulkImportGuests(req, res) {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ message: 'No rows provided' });
    }

    let roleId = req.body.roleId || null;
    const roleCode = String(req.body.roleCode || '').trim().toUpperCase();

    if (!roleId && roleCode) {
      const role = await Role.findOne({ code: roleCode });
      roleId = role?._id || null;
    }

    const created = [];
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      try {
        const name = String(row.name || row.fullName || '').trim();
        const username = String(row.username || '').trim();
        const password = String(row.password || '').trim() || 'guest123';

        if (!name || !username) {
          throw new Error('Name and username are required');
        }

        const doc = await User.create({
          name,
          username,
          password,
          mobile: String(row.mobile || '').trim(),
          email: String(row.email || '').trim(),
          roleId: row.roleId || roleId,
          eventDutyType: 'GUEST',
          isActive: row.isActive !== undefined ? Boolean(row.isActive) : true,
        });

        const populated = await User.findById(doc._id).populate('roleId');
        created.push(populated);
      } catch (error) {
        errors.push({
          row: index + 2,
          username: row.username || '',
          message: error.message,
        });
      }
    }

    res.status(201).json({
      message: `Imported ${created.length} guest(s)`,
      created,
      errors,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = { getUsers, createUser, updateUser, bulkImportGuests };
