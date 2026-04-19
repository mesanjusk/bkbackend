function list(Model, populate = '') {
  return async (req, res) => {
    const query = Model.find().sort({ createdAt: -1 });
    if (populate) query.populate(populate);
    res.json(await query);
  };
}

function getOne(Model, populate = '') {
  return async (req, res) => {
    const query = Model.findById(req.params.id);
    if (populate) query.populate(populate);
    const doc = await query;
    if (!doc) return res.status(404).json({ message: 'Record not found' });
    res.json(doc);
  };
}

function create(Model, populate = '') {
  return async (req, res) => {
    const doc = await Model.create(req.body);
    const result = populate ? await Model.findById(doc._id).populate(populate) : doc;
    res.status(201).json(result);
  };
}

function update(Model, populate = '') {
  return async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Record not found' });
    const result = populate ? await Model.findById(doc._id).populate(populate) : doc;
    res.json(result);
  };
}

function remove(Model) {
  return async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Record not found' });
    res.json({ success: true });
  };
}

module.exports = { list, getOne, create, update, remove };
