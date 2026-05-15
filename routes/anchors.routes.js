const router = require('express').Router();
const { publicRegister, getPublicEdit, putPublicEdit } = require('../controllers/anchors.controller');

router.post('/public-register', publicRegister);
router.get('/public-edit/:token', getPublicEdit);
router.put('/public-edit/:token', putPublicEdit);

module.exports = router;
