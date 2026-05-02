const mongoose = require('mongoose');

/**
 * Auto-reply rules applied to incoming Baileys (WhatsApp Web) messages.
 * Schema mirrors WhatsAppAutoReplyRule so both providers stay consistent.
 */
const BaileysAutoReplyRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // Matching
    matchType: {
      type: String,
      enum: ['CONTAINS', 'EXACT', 'STARTS_WITH', 'ALL'],
      default: 'CONTAINS',
    },
    triggerText: { type: String, default: '' }, // empty = match all when matchType is ALL

    // Reply
    replyType: { type: String, enum: ['TEXT', 'TEMPLATE'], default: 'TEXT' },
    replyText: { type: String, default: '' },
    templateName: { type: String, default: '' },
    templateLanguage: { type: String, default: 'en_US' },

    // Control
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 100 }, // lower = evaluated first
    stopAfterMatch: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index for quick active-rule lookup sorted by priority
BaileysAutoReplyRuleSchema.index({ isActive: 1, priority: 1 });

module.exports = mongoose.model('BaileysAutoReplyRule', BaileysAutoReplyRuleSchema);
