/**
 * Baileys WhatsApp service
 * Auth state is persisted in MongoDB (via baileysAuthState.js) so it survives
 * Render / Heroku / any ephemeral-filesystem host redeploys.
 */

const { emitEvent } = require('./socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');

let baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket = null;
let reconnectTimer = null;

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadDeps() {
  try {
    return await import('@whiskeysockets/baileys');
  } catch (e) {
    throw new Error(
      'Baileys not installed. Run: npm install @whiskeysockets/baileys qrcode pino'
    );
  }
}

async function toQrDataUrl(raw) {
  try {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toDataURL(raw);
  } catch (_) {
    return raw; // fall back to raw string if qrcode pkg missing
  }
}

function formatJid(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
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

// ── public API ────────────────────────────────────────────────────────────────

function getStatus() {
  return { ...baileysState };
}

async function connect() {
  // Clear any pending reconnect
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  // Close existing socket cleanly
  if (baileysSocket) {
    try { baileysSocket.end(undefined); } catch (_) {}
    baileysSocket = null;
  }

  const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
  } = await loadDeps();

  const pino = (await import('pino')).default;
  const logger = pino({ level: 'silent' });

  // ✅ Use MongoDB-backed auth state — survives redeploys
  const { state, saveCreds } = await useMongoAuthState();

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Reduce memory footprint on free-tier hosts
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  baileysSocket = sock;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrDataUrl = await toQrDataUrl(qr);
      baileysState = { qr: qrDataUrl, status: 'QR_PENDING', phone: '' };
      emitEvent('baileys_status', baileysState);
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || sock.user?.id || '';
      baileysState = { qr: null, status: 'CONNECTED', phone };
      emitEvent('baileys_status', baileysState);
      console.log('[baileys] connected as', phone);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log('[baileys] disconnected, code:', code, 'loggedOut:', loggedOut);

      baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
      emitEvent('baileys_status', baileysState);
      baileysSocket = null;

      if (loggedOut) {
        // Wipe stored credentials from MongoDB
        await clearMongoAuthState().catch(console.error);
      } else {
        // Auto-reconnect after 4 s
        reconnectTimer = setTimeout(() => connect().catch(console.error), 4000);
      }
    }
  });

  sock.ev.on('creds.update', () => saveCreds().catch(console.error));

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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (baileysSocket) {
    try { baileysSocket.end(undefined); } catch (_) {}
    baileysSocket = null;
  }
  // Also wipe stored creds so next connect() starts fresh (= new QR)
  await clearMongoAuthState().catch(console.error);
  baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
  emitEvent('baileys_status', baileysState);
}

async function sendText({ to, body }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected. Scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), { text: body });
}

async function sendImage({ to, imageUrl, caption = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected. Scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), {
    image: { url: imageUrl },
    caption,
  });
}

module.exports = { connect, disconnect, sendText, sendImage, getStatus };
