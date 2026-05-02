const BaileysMessage = require('../models/BaileysMessage');
const Notification = require('../models/Notification');
const { emitEvent } = require('../services/socket');
const baileysService = require('../services/baileysService');

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}
function getConversationKey(phone) {
  return normalizePhone(phone);
}

// ── Status & QR ──────────────────────────────────────────────────────────────

async function getStatus(req, res) {
  res.json(baileysService.getStatus());
}

async function startConnection(req, res) {
  try {
    await baileysService.connect();
    res.json({ message: 'Baileys connecting…', status: baileysService.getStatus() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function stopConnection(req, res) {
  try {
    await baileysService.disconnect();
    res.json({ message: 'Baileys disconnected' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

async function getInbox(req, res) {
  const messages = await BaileysMessage.find({ conversationKey: { $ne: '' } })
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  const grouped = new Map();
  for (const item of messages) {
    const key = item.conversationKey || getConversationKey(item.from || item.to);
    if (!key) continue;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        conversationKey: key,
        phone: key,
        contactName: item.contactName || '',
        lastMessage: item.bodyText || item.messageType,
        lastMessageAt: item.createdAt,
        lastDirection: item.direction,
        unreadCount: item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0,
        lastStatus: item.status,
        messages: 1,
        provider: 'baileys',
      });
    } else {
      current.unreadCount += item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0;
      current.messages += 1;
      if (!current.contactName && item.contactName) current.contactName = item.contactName;
    }
  }

  res.json(
    Array.from(grouped.values()).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
  );
}

async function getConversation(req, res) {
  const conversationKey = getConversationKey(req.params.conversationKey);
  const rows = await BaileysMessage.find({ conversationKey }).sort({ createdAt: 1 }).lean();
  res.json(rows);
}

async function markConversationRead(req, res) {
  const conversationKey = getConversationKey(req.params.conversationKey);
  await BaileysMessage.updateMany(
    { conversationKey, direction: 'INCOMING', status: { $in: ['RECEIVED', 'DELIVERED'] } },
    { $set: { status: 'READ' } }
  );
  res.json({ message: 'Marked as read' });
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendText(req, res) {
  const { to, text, contactName = '', replyToMessageId = '' } = req.body;
  if (!to || !text) return res.status(400).json({ message: 'to and text are required' });

  try {
    const result = await baileysService.sendText({ to, body: text });
    const log = await BaileysMessage.create({
      to: normalizePhone(to),
      from: '',
      contactName,
      conversationKey: getConversationKey(to),
      baileysMessageId: result?.key?.id || '',
      replyToMessageId,
      direction: 'OUTGOING',
      source: 'MANUAL',
      messageType: 'TEXT',
      bodyText: text,
      status: 'SENT',
      meta: result || {},
    });
    emitEvent('baileys_message_logged', log);
    return res.status(201).json(log);
  } catch (error) {
    const log = await BaileysMessage.create({
      to: normalizePhone(to),
      contactName,
      conversationKey: getConversationKey(to),
      direction: 'OUTGOING',
      source: 'MANUAL',
      messageType: 'TEXT',
      bodyText: text,
      status: 'FAILED',
      meta: { error: error.message },
    });
    return res.status(500).json(log);
  }
}

// ── Incoming (called from baileysService event) ───────────────────────────────

async function saveIncomingMessage({ id, from, body, type, raw }) {
  const existing = id ? await BaileysMessage.findOne({ baileysMessageId: id }) : null;
  if (existing) return existing;

  const created = await BaileysMessage.create({
    to: '',
    from: normalizePhone(from),
    conversationKey: getConversationKey(from),
    baileysMessageId: id || '',
    direction: 'INCOMING',
    source: 'WEBHOOK',
    messageType: String(type || 'TEXT').toUpperCase(),
    bodyText: body || '',
    status: 'RECEIVED',
    meta: raw || {},
  });

  emitEvent('baileys_message_logged', created);
  emitEvent('baileys_incoming_message', created);

  await Notification.create({
    title: 'New Baileys WhatsApp message',
    message: `${from} sent a new message`,
    type: 'WHATSAPP',
    targetRoles: ['ADMIN', 'SENIOR_TEAM'],
  }).catch(() => null);

  return created;
}

// Wire up incoming messages from the service layer
const socket = require('../services/socket');
// We listen for the baileys_incoming_message socket event that baileysService fires
// and persist it. Done here to avoid circular deps.
(function wireIncoming() {
  const { EventEmitter } = require('events');
  if (!global._baileysIncomingWired) {
    global._baileysIncomingWired = true;
    // patch emitEvent so we can intercept baileys_incoming_message before it goes to WS
    const origEmit = socket.emitEvent;
    socket.emitEvent = function (event, data) {
      if (event === 'baileys_incoming_message') {
        saveIncomingMessage(data).catch(console.error);
      }
      return origEmit(event, data);
    };
  }
})();

module.exports = {
  getStatus,
  startConnection,
  stopConnection,
  getInbox,
  getConversation,
  markConversationRead,
  sendText,
};
