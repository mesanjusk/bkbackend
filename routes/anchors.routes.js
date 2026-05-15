const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getAnchors, publicRegister, getPublicEdit, putPublicEdit } = require('../controllers/anchors.controller');

router.get('/', protect, getAnchors);
router.post('/public-register', publicRegister);
router.get('/public-edit/:token', getPublicEdit);
router.put('/public-edit/:token', putPublicEdit);

module.exports = router;
