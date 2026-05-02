/**
 * Baileys WhatsApp service
 * Manages a single Baileys connection (scan-to-connect via QR code).
 * All state lives in memory + the auth_info_baileys folder on disk.
 */

let baileys = null;
let baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket = null;
let saveCreds = null;
let qrcode = null;

// Lazy-load optional deps so the server boots even if baileys isn't installed yet
async function loadDeps() {
  if (!baileys) {
    try {
      baileys = await import('@whiskeysockets/baileys');
      qrcode = (await import('qrcode')).default;
    } catch (e) {
      throw new Error('Baileys not installed. Run: npm install @whiskeysockets/baileys qrcode pino');
    }
  }
  return baileys;
}

const { emitEvent } = require('./socket');
const path = require('path');
const AUTH_FOLDER = path.join(process.cwd(), 'baileys_auth');

function getStatus() {
  return baileysState;
}

async function connect() {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
  } = await loadDeps();

  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  saveCreds = _saveCreds;

  const { version } = await fetchLatestBaileysVersion();

  const pino = (await import('pino')).default;
  const logger = pino({ level: 'silent' });

  const sock = baileys.default
    ? new (baileys.default)({ auth: state, version, logger, printQRInTerminal: false })
    : makeWASocket({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, version, logger, printQRInTerminal: false });

  baileysSocket = sock;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        baileysState = { ...baileysState, qr: qrDataUrl, status: 'QR_PENDING' };
        emitEvent('baileys_status', baileysState);
      } catch (_) {
        baileysState = { ...baileysState, qr, status: 'QR_PENDING' };
        emitEvent('baileys_status', baileysState);
      }
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || sock.user?.id || '';
      baileysState = { qr: null, status: 'CONNECTED', phone };
      emitEvent('baileys_status', baileysState);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
      emitEvent('baileys_status', baileysState);
      if (shouldReconnect) {
        setTimeout(() => connect().catch(console.error), 3000);
      }
    }
  });

  sock.ev.on('creds.update', () => {
    if (saveCreds) saveCreds();
  });

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        emitEvent('baileys_incoming_message', normalizeBaileysMessage(msg));
      }
    }
  });

  return sock;
}

async function disconnect() {
  if (baileysSocket) {
    try { baileysSocket.end(); } catch (_) {}
    baileysSocket = null;
  }
  baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
  emitEvent('baileys_status', baileysState);
}

/**
 * Send a plain text message via Baileys
 */
async function sendText({ to, body }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected');
  }
  const jid = formatJid(to);
  const result = await baileysSocket.sendMessage(jid, { text: body });
  return result;
}

/**
 * Send an image message via Baileys (URL or buffer)
 */
async function sendImage({ to, imageUrl, caption = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected');
  }
  const jid = formatJid(to);
  const result = await baileysSocket.sendMessage(jid, {
    image: { url: imageUrl },
    caption,
  });
  return result;
}

function formatJid(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.includes('@')) return clean;
  return `${clean}@s.whatsapp.net`;
}

function normalizeBaileysMessage(msg) {
  const from = (msg.key.remoteJid || '').split('@')[0];
  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';
  return {
    id: msg.key.id,
    from,
    body,
    type: msg.message?.imageMessage ? 'image' : 'text',
    timestamp: msg.messageTimestamp,
    raw: msg,
  };
}

module.exports = { connect, disconnect, sendText, sendImage, getStatus };
