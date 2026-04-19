const express = require('express');
const { protect } = require('../middleware/auth');

module.exports = function crudRoutes(Model, populate = '') {
  const router = express.Router();

  router.get('/', protect, async (req, res) => {
    try {
      let query = Model.find().sort({ createdAt: -1 });
      if (populate) query = query.populate(populate);
      const docs = await query;
      res.json(docs);
    } catch (err) {
      console.error(`[${Model.modelName}] GET error:`, err);
      res.status(500).json({ message: err.message || 'Failed to fetch records' });
    }
  });

  router.get('/:id', protect, async (req, res) => {
    try {
      let query = Model.findById(req.params.id);
      if (populate) query = query.populate(populate);
      const doc = await query;

      if (!doc) {
        return res.status(404).json({ message: 'Record not found' });
      }

      res.json(doc);
    } catch (err) {
      console.error(`[${Model.modelName}] GET BY ID error:`, err);
      res.status(500).json({ message: err.message || 'Failed to fetch record' });
    }
  });

  router.post('/', protect, async (req, res) => {
    try {
      const created = await Model.create(req.body);

      let query = Model.findById(created._id);
      if (populate) query = query.populate(populate);
      const saved = await query;

      res.status(201).json(saved);
    } catch (err) {
      console.error(`[${Model.modelName}] POST error:`, err);

      if (err.code === 11000) {
        return res.status(400).json({
          message: `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'unique field'}`
        });
      }

      res.status(500).json({ message: err.message || 'Failed to create record' });
    }
  });

  router.put('/:id', protect, async (req, res) => {
    try {
      const updatedDoc = await Model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
      });

      if (!updatedDoc) {
        return res.status(404).json({ message: 'Record not found' });
      }

      let query = Model.findById(updatedDoc._id);
      if (populate) query = query.populate(populate);
      const populated = await query;

      res.json(populated);
    } catch (err) {
      console.error(`[${Model.modelName}] PUT error:`, err);

      if (err.code === 11000) {
        return res.status(400).json({
          message: `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'unique field'}`
        });
      }

      res.status(500).json({ message: err.message || 'Failed to update record' });
    }
  });

  router.delete('/:id', protect, async (req, res) => {
    try {
      const deleted = await Model.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({ message: 'Record not found' });
      }

      res.json({ message: 'Deleted successfully' });
    } catch (err) {
      console.error(`[${Model.modelName}] DELETE error:`, err);
      res.status(500).json({ message: err.message || 'Failed to delete record' });
    }
  });

  return router;
};