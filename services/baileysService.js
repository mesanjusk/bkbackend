/**
 * Baileys WhatsApp service
 *
 * Key fixes vs previous version:
 *  1. Pins WA version to [2,3000,1023024415] — avoids fetchLatestBaileysVersion()
 *     timing out on Render and returning a bad version that breaks QR handshake.
 *  2. Does NOT wrap keys with makeCacheableSignalKeyStore — our MongoDB adapter
 *     already caches in memory; double-wrapping corrupts signal key lookups.
 *  3. Passes auth object directly as { creds, keys } — the correct shape.
 *  4. Adds browser fingerprint so WA treats the session as WhatsApp Web.
 */

const { emitEvent } = require('./socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');

// Stable WA Web version — avoids network call to version endpoint on every boot.
// Update periodically if Baileys starts rejecting connections.
const WA_VERSION = [2, 3000, 1023024415];

let baileysState  = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket = null;
let reconnectTimer = null;
let isConnecting   = false;   // prevent overlapping connect() calls

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadMakeWASocket() {
  try {
    const mod = await import('@whiskeysockets/baileys');
    // Baileys exports default differently depending on CJS/ESM interop
    return mod.default ?? mod.makeWASocket ?? mod;
  } catch {
    throw new Error('Baileys not installed. Run: npm install @whiskeysockets/baileys qrcode pino');
  }
}

async function toQrDataUrl(raw) {
  try {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toDataURL(raw);
  } catch {
    return raw;
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
    id:        msg.key.id,
    from,
    body,
    type:      msg.message?.imageMessage ? 'image' : 'text',
    timestamp: msg.messageTimestamp,
    raw:       msg,
  };
}

function killSocket() {
  if (baileysSocket) {
    try { baileysSocket.end(undefined); } catch (_) {}
    baileysSocket = null;
  }
}

// ── public API ────────────────────────────────────────────────────────────────

function getStatus() {
  return { ...baileysState };
}

async function connect() {
  if (isConnecting) {
    console.log('[baileys] connect() already in progress, skipping');
    return;
  }
  isConnecting = true;

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();

  try {
    const makeWASocket = await loadMakeWASocket();
    const pino = (await import('pino')).default;

    // Silent logger — pino output on Render floods the log stream
    const logger = pino({ level: 'silent' });

    // MongoDB-backed auth (survives redeploys, write-through cached in memory)
    const { state, saveCreds } = await useMongoAuthState();

    const sock = makeWASocket({
      version:  WA_VERSION,
      logger,
      printQRInTerminal: false,

      // Correct auth shape — do NOT wrap keys with makeCacheableSignalKeyStore
      // (our adapter is already cached; double-wrapping breaks signal handshake)
      auth: {
        creds: state.creds,
        keys:  state.keys,
      },

      // Identify as WhatsApp Web so WA accepts the Noise handshake
      browser: ['BK Awards', 'Chrome', '120.0.0'],

      // Reduce memory & CPU on free-tier
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
      markOnlineOnConnect:            false,

      // Longer timeouts help on slow cold-start hosts
      connectTimeoutMs:    60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
    });

    baileysSocket = sock;

    // ── connection lifecycle ──────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[baileys] QR received, rendering…');
        const qrDataUrl = await toQrDataUrl(qr);
        baileysState = { qr: qrDataUrl, status: 'QR_PENDING', phone: '' };
        emitEvent('baileys_status', baileysState);
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] || sock.user?.id || '';
        baileysState = { qr: null, status: 'CONNECTED', phone };
        emitEvent('baileys_status', baileysState);
        console.log('[baileys] connected as +' + phone);
        isConnecting = false;
      }

      if (connection === 'close') {
        const err  = lastDisconnect?.error;
        const code = err?.output?.statusCode;
        // DisconnectReason.loggedOut = 401
        const loggedOut = code === 401;

        console.log('[baileys] disconnected code=' + code + ' loggedOut=' + loggedOut);

        baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
        emitEvent('baileys_status', baileysState);
        baileysSocket = null;
        isConnecting  = false;

        if (loggedOut) {
          await clearMongoAuthState().catch(console.error);
          console.log('[baileys] logged out — credentials cleared');
        } else {
          // Back-off reconnect (don't hammer on errors)
          const delay = code === 408 ? 8000 : 5000;
          console.log('[baileys] reconnecting in ' + delay + 'ms…');
          reconnectTimer = setTimeout(() => connect().catch(console.error), delay);
        }
      }
    });

    // ── persist creds on every mutation ──────────────────────────────────────
    sock.ev.on('creds.update', () => saveCreds().catch(console.error));

    // ── incoming messages → emit for controller to persist ────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          emitEvent('baileys_incoming_message', normalizeBaileysMessage(msg));
        }
      }
    });

  } catch (err) {
    isConnecting = false;
    console.error('[baileys] connect() error:', err.message);
    baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
    emitEvent('baileys_status', baileysState);
    throw err;
  }
}

async function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();
  await clearMongoAuthState().catch(console.error);
  baileysState  = { qr: null, status: 'DISCONNECTED', phone: '' };
  isConnecting  = false;
  emitEvent('baileys_status', baileysState);
}

async function sendText({ to, body }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), { text: body });
}

async function sendImage({ to, imageUrl, caption = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), { image: { url: imageUrl }, caption });
}

module.exports = { connect, disconnect, sendText, sendImage, getStatus };
