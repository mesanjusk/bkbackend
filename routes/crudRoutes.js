const router = require('express').Router();
const { list, create } = require('../controllers/genericController');
const { protect } = require('../middleware/auth');

module.exports = function(Model, populate='') {
  router.get('/', protect, list(Model, populate));
  router.post('/', protect, create(Model, populate));
  return router;
};
