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

// ── Status & QR ───────────────────────────────────────────────────────────────

async function getStatus(req, res) {
  res.json(baileysService.getStatus());
}

async function startConnection(req, res) {
  try {
    console.log('[baileys] /connect hit — starting connection');
    await baileysService.connect();
    res.json({ message: 'Baileys connecting…', status: baileysService.getStatus() });
  } catch (error) {
    console.error('[baileys] startConnection error:', error.message);
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

// ── Send Text ──────────────────────────────────────────────────────────────────

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

// ── Logs (flat list of all messages) ─────────────────────────────────────────

async function getLogs(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const logs = await BaileysMessage.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Send Invitation (image blast) ─────────────────────────────────────────────

async function sendInvitation(req, res) {
  const {
    imageUrl,
    eventName,
    date,
    time,
    venue,
    textPosition = 'bottom',
    recipients = [],
  } = req.body;

  const missingFields = [];
  if (!imageUrl)       missingFields.push('imageUrl');
  if (!eventName)      missingFields.push('eventName');
  if (!date)           missingFields.push('date');
  if (!time)           missingFields.push('time');
  if (!venue)          missingFields.push('venue');
  if (!recipients.length) missingFields.push('recipients');

  if (missingFields.length) {
    return res.status(400).json({ message: 'Missing required fields', missingFields });
  }

  let success = 0;
  let failed  = 0;
  const errors = [];

  const caption = `🎉 *${eventName}*\n📅 ${date}  🕐 ${time}\n📍 ${venue}`;

  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.mobile || recipient.phone || '');
    if (!phone) { failed++; continue; }

    try {
      await baileysService.sendImage({ to: phone, imageUrl, caption });

      await BaileysMessage.create({
        to: phone,
        from: '',
        contactName: recipient.name || '',
        conversationKey: getConversationKey(phone),
        direction: 'OUTGOING',
        source: 'INVITATION',
        messageType: 'IMAGE',
        bodyText: caption,
        status: 'SENT',
        meta: { eventName, date, time, venue, imageUrl, textPosition },
      });

      success++;
    } catch (err) {
      failed++;
      errors.push({ phone, error: err.message });

      await BaileysMessage.create({
        to: phone,
        contactName: recipient.name || '',
        conversationKey: getConversationKey(phone),
        direction: 'OUTGOING',
        source: 'INVITATION',
        messageType: 'IMAGE',
        bodyText: caption,
        status: 'FAILED',
        meta: { error: err.message },
      }).catch(() => null);
    }
  }

  res.json({
    message: `Invitation sent: ${success} success, ${failed} failed`,
    total: recipients.length,
    success,
    failed,
    errors,
  });
}

// ── Incoming (called from baileysService event) ───────────────────────────────

async function saveIncomingMessage({ id, from, body, type, raw }) {
  const existing = id
    ? await BaileysMessage.findOne({ baileysMessageId: id })
    : null;
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
(function wireIncoming() {
  if (!global._baileysIncomingWired) {
    global._baileysIncomingWired = true;
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
  getLogs,
  sendInvitation,
};
