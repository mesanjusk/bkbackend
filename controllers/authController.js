const jwt = require('jsonwebtoken');
const User = require('../models/User');

function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function login(req, res) {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).populate('roleId');
  if (!user) return res.status(401).json({ message: 'Invalid username or password' });

  const ok = await user.matchPassword(password);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

  res.json({
    token: generateToken(user._id),
    user
  });
}

async function me(req, res) {
  res.json(req.user);
}

module.exports = { login, me };
