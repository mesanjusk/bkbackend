const router = require('express').Router();
const { list, getOne, create, update, remove } = require('../controllers/genericController');
const { protect } = require('../middleware/auth');

module.exports = function(Model, populate='') {
  router.get('/', protect, list(Model, populate));
  router.get('/:id', protect, getOne(Model, populate));
  router.post('/', protect, create(Model, populate));
  router.put('/:id', protect, update(Model, populate));
  router.patch('/:id', protect, update(Model, populate));
  router.delete('/:id', protect, remove(Model));
  return router;
};
