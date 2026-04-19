function list(Model, populate = '') {
  return async (req, res) => {
    const query = Model.find().sort({ createdAt: -1 });
    if (populate) query.populate(populate);
    const docs = await query;
    res.json(docs);
  };
}

function create(Model, populate = '') {
  return async (req, res) => {
    const doc = await Model.create(req.body);
    const result = populate ? await Model.findById(doc._id).populate(populate) : doc;
    res.status(201).json(result);
  };
}

module.exports = { list, create };
