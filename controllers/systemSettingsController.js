const SystemSetting = require('../models/SystemSetting');

// Default settings — baileys is the default provider
const DEFAULTS = [
  {
    key: 'registration_whatsapp_provider',
    value: 'baileys',
    label: 'Registration WhatsApp Provider',
    description:
      'Controls which WhatsApp provider sends the auto-confirmation on student registration. "baileys" uses WhatsApp Web (QR-based); "official" uses Meta Cloud API.',
  },
];

async function ensureDefaults() {
  for (const def of DEFAULTS) {
    await SystemSetting.updateOne(
      { key: def.key },
      { $setOnInsert: def },
      { upsert: true }
    );
  }
}

async function getSettings(req, res) {
  try {
    await ensureDefaults();
    const settings = await SystemSetting.find().sort({ key: 1 }).lean();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.json({ settings, map });
  } catch (err) {
    console.error('[systemSettings] getSettings error:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch settings' });
  }
}

async function updateSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ message: 'value is required' });
    const updated = await SystemSetting.findOneAndUpdate(
      { key },
      { $set: { value } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('[systemSettings] updateSetting error:', err);
    res.status(500).json({ message: err.message || 'Failed to update setting' });
  }
}

async function updateSettings(req, res) {
  try {
    const updates = req.body;
    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      const doc = await SystemSetting.findOneAndUpdate(
        { key },
        { $set: { value } },
        { new: true, upsert: true }
      );
      results.push(doc);
    }
    res.json({ updated: results.length, results });
  } catch (err) {
    console.error('[systemSettings] updateSettings error:', err);
    res.status(500).json({ message: err.message || 'Failed to update settings' });
  }
}

// Helper used by studentController — falls back to 'baileys' if not set
async function getSettingValue(key, fallback = 'baileys') {
  try {
    const doc = await SystemSetting.findOne({ key }).lean();
    return doc ? doc.value : fallback;
  } catch {
    return fallback;
  }
}

module.exports = { getSettings, updateSetting, updateSettings, getSettingValue };
