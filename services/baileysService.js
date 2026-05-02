/**
 * Baileys WhatsApp service
 *
 * FIX for code=405: fetchLatestBaileysVersion is a NAMED export from Baileys,
 * not a property of the default export. Must be destructured from the raw module.
 * The pinned fallback version is also updated to a known-good recent value.
 */

const { emitEvent } = require('./socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');

const MAX_RECONNECT_ATTEMPTS = 5;

let baileysState   = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket  = null;
let reconnectTimer = null;
let isConnecting   = false;
let reconnectCount = 0;

// ── helpers ───────────────────────────────────────────────────────────────────

async function getWASocketAndVersion() {
  // Baileys uses ESM — import() gives us the full module namespace
  const mod = await import('@whiskeysockets/baileys');

  // makeWASocket is the default export or a named export
  const makeWASocket = mod.default?.makeWASocket
    ?? mod.makeWASocket
    ?? mod.default
    ?? mod;

  // fetchLatestBaileysVersion is a NAMED export — NOT on the default object
  const fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion
    ?? mod.default?.fetchLatestBaileysVersion;

  let version = [2, 3000, 1023024415]; // fallback

  if (typeof fetchLatestBaileysVersion === 'function') {
    try {
      const result = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
      ]);
      if (Array.isArray(result?.version) && result.version.length === 3) {
        version = result.version;
        console.log('[baileys] live WA version:', version.join('.'));
      }
    } catch (e) {
      console.warn('[baileys] version fetch error:', e.message, '— using fallback');
    }
  } else {
    console.warn('[baileys] fetchLatestBaileysVersion not found in module — using fallback version');
    // Log all keys so we can see what IS available
    console.log('[baileys] module keys:', Object.keys(mod).join(', '));
  }

  return { makeWASocket, version };
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
    msg.message?.imageMessage?.caption || '';
  return {
    id: msg.key.id, from, body,
    type: msg.message?.imageMessage ? 'image' : 'text',
    timestamp: msg.messageTimestamp,
    raw: msg,
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
    console.log('[baileys] resetting stuck isConnecting flag...');
    isConnecting = false;
  }
  isConnecting = true;
  console.log('[baileys] connect() called — starting Baileys socket...');

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();

  try {
    const { makeWASocket, version } = await getWASocketAndVersion();
    const pino   = (await import('pino')).default;
    const logger = pino({ level: 'silent' });

    const { state, saveCreds } = await useMongoAuthState();

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: state.keys },
      browser: ['BK Awards', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
      markOnlineOnConnect:            false,
      connectTimeoutMs:    60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
    });

    baileysSocket = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[baileys] QR received — emitting to dashboard');
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
        reconnectCount = 0;
      }

      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === 401;
        console.log('[baileys] disconnected code=' + code);

        baileysState  = { qr: null, status: 'DISCONNECTED', phone: '' };
        baileysSocket = null;
        isConnecting  = false;
        emitEvent('baileys_status', baileysState);

        if (loggedOut || code === 405) {
          await clearMongoAuthState().catch(console.error);
          reconnectCount = 0;
          console.log('[baileys] code=' + code + ' — credentials cleared. Click Connect for a fresh QR.');
        } else {
          reconnectCount++;
          if (reconnectCount <= MAX_RECONNECT_ATTEMPTS) {
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
  baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
  isConnecting = false;
  emitEvent('baileys_status', baileysState);
  console.log('[baileys] disconnected and credentials cleared.');
}

async function sendText({ to, body }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED')
    throw new Error('Baileys not connected — scan QR first.');
  return baileysSocket.sendMessage(formatJid(to), { text: body });
}

async function sendImage({ to, imageUrl, caption = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED')
    throw new Error('Baileys not connected — scan QR first.');
  return baileysSocket.sendMessage(formatJid(to), { image: { url: imageUrl }, caption });
}

async function autoConnectIfCredentialsExist() {
  try {
    const { state } = await useMongoAuthState();
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
