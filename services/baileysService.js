/**
 * Baileys WhatsApp service — Fixed Version
 *
 * Fixes applied:
 *  1. Auto-connects on server boot if saved credentials exist (no manual click needed).
 *  2. QR code refreshes automatically — each new QR from WhatsApp is emitted immediately.
 *  3. Stable reconnect with back-off — survives transient disconnects.
 *  4. Does NOT wrap keys with makeCacheableSignalKeyStore (our MongoDB adapter already caches).
 *  5. Passes auth object directly as { creds, keys }.
 *  6. Browser fingerprint so WA treats session as WhatsApp Web.
 *  7. Pinned WA version — avoids fetchLatestBaileysVersion() timing out on Render.
 */

const { emitEvent } = require('./socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');

// Stable WA Web version — update periodically if connections start failing
const WA_VERSION = [2, 3000, 1023024415];

// Max reconnect attempts before giving up (prevents infinite loops on bad credentials)
const MAX_RECONNECT_ATTEMPTS = 5;

let baileysState     = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket    = null;
let reconnectTimer   = null;
let isConnecting     = false;
let reconnectCount   = 0;

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadMakeWASocket() {
  try {
    const mod = await import('@whiskeysockets/baileys');
    return mod.default ?? mod.makeWASocket ?? mod;
  } catch {
    throw new Error('Baileys not installed. Run: npm install @whiskeysockets/baileys qrcode pino');
  }
}

async function toQrDataUrl(raw) {
  try {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toDataURL(raw, { width: 300 });
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
    const logger = pino({ level: 'silent' });

    const { state, saveCreds } = await useMongoAuthState();

    const sock = makeWASocket({
      version:  WA_VERSION,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys:  state.keys,
      },
      browser: ['BK Awards', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
      markOnlineOnConnect:            false,
      connectTimeoutMs:    60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
    });

    baileysSocket = sock;

    // ── connection lifecycle ──────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // FIX: Every new QR from WhatsApp is immediately emitted — no refresh needed
      if (qr) {
        console.log('[baileys] New QR received — emitting to dashboard');
        const qrDataUrl = await toQrDataUrl(qr);
        baileysState = { qr: qrDataUrl, status: 'QR_PENDING', phone: '' };
        emitEvent('baileys_status', baileysState);
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] || sock.user?.id || '';
        baileysState = { qr: null, status: 'CONNECTED', phone };
        emitEvent('baileys_status', baileysState);
        console.log('[baileys] connected as +' + phone);
        isConnecting   = false;
        reconnectCount = 0; // reset on successful connection
      }

      if (connection === 'close') {
        const err      = lastDisconnect?.error;
        const code     = err?.output?.statusCode;
        const loggedOut = code === 401;

        console.log('[baileys] disconnected code=' + code + ' loggedOut=' + loggedOut);

        baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
        emitEvent('baileys_status', baileysState);
        baileysSocket = null;
        isConnecting  = false;

        if (loggedOut) {
          await clearMongoAuthState().catch(console.error);
          reconnectCount = 0;
          console.log('[baileys] logged out — credentials cleared. Scan QR again to reconnect.');
        } else {
          reconnectCount++;
          if (reconnectCount <= MAX_RECONNECT_ATTEMPTS) {
            // Exponential back-off: 5s, 8s, 12s, 18s, 25s
            const delay = Math.min(5000 * reconnectCount, 25000);
            console.log(`[baileys] reconnecting in ${delay}ms (attempt ${reconnectCount}/${MAX_RECONNECT_ATTEMPTS})…`);
            reconnectTimer = setTimeout(() => connect().catch(console.error), delay);
          } else {
            console.log('[baileys] max reconnect attempts reached. Manual reconnect required.');
            reconnectCount = 0;
          }
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

  } catch (err) {
    isConnecting = false;
    console.error('[baileys] connect() error:', err.message);
    baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
    emitEvent('baileys_status', baileysState);
    throw err;
  }
}

async function disconnect() {
  reconnectCount = 0;
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

/**
 * Auto-connect on server boot if saved credentials exist.
 * Called from app.js / server.js after DB connection is ready.
 */
async function autoConnectIfCredentialsExist() {
  try {
    const { useMongoAuthState: getState } = require('./baileysAuthState');
    const { state } = await getState();
    // If creds exist and have a me/noiseKey, we have a saved session
    const hasCreds = state?.creds?.me || state?.creds?.noiseKey;
    if (hasCreds) {
      console.log('[baileys] Saved credentials found — auto-connecting on boot…');
      await connect();
    } else {
      console.log('[baileys] No saved credentials — waiting for manual QR scan.');
    }
  } catch (err) {
    console.error('[baileys] autoConnect error:', err.message);
  }
}

module.exports = { connect, disconnect, sendText, sendImage, getStatus, autoConnectIfCredentialsExist };
