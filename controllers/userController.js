const User = require('../models/User');

const getUsers = async (req, res) => {
  try {
    const users = await User.find().populate('roleId').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);
    const populated = await User.findById(user._id).populate('roleId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { getUsers, createUser };
