const express = require('express');
const { getUsers, createUser } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, getUsers);
router.post('/', protect, createUser);

module.exports = router;
