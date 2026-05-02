/**
 * Baileys WhatsApp service — Fixed Version
 *
 * KEY FIX for code=405 rejection:
 *   WhatsApp servers reject connections with a stale/pinned version.
 *   This version now calls fetchLatestBaileysVersion() each time connect()
 *   is called, with a 10s timeout and fallback so Render cold-starts don't hang.
 *
 * Other fixes:
 *  - isConnecting flag RESETS instead of blocking (prevents silent no-op)
 *  - QR emitted immediately on arrival
 *  - Exponential back-off reconnect with max attempt cap
 *  - Auth passed directly as { creds, keys } — no double-wrapping
 *  - Browser fingerprint for WA Web session
 *  - code=405 now clears credentials and stops retry loop
 */

const { emitEvent } = require('./socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');

// Fallback only — used if version fetch fails or times out
const WA_VERSION_FALLBACK = [2, 3000, 1023024415];

// Max reconnect attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 5;

let baileysState   = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket  = null;
let reconnectTimer = null;
let isConnecting   = false;
let reconnectCount = 0;

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadBaileys() {
  try {
    const mod = await import('@whiskeysockets/baileys');
    return mod.default ?? mod;
  } catch {
    throw new Error('Baileys not installed. Run: npm install @whiskeysockets/baileys qrcode pino');
  }
}

async function getWAVersion(baileysMod) {
  try {
    const result = await Promise.race([
      baileysMod.fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    const version = result?.version;
    if (Array.isArray(version) && version.length === 3) {
      console.log('[baileys] live WA version:', version.join('.'));
      return version;
    }
    throw new Error('bad version shape');
  } catch (e) {
    console.warn('[baileys] version fetch failed (' + e.message + ') — using fallback:', WA_VERSION_FALLBACK.join('.'));
    return WA_VERSION_FALLBACK;
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
    console.log('[baileys] resetting stuck isConnecting flag and retrying...');
    isConnecting = false;
  }
  isConnecting = true;

  console.log('[baileys] connect() called — starting Baileys socket...');

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();

  try {
    const baileysMod   = await loadBaileys();
    const makeWASocket = baileysMod.makeWASocket ?? baileysMod.default ?? baileysMod;
    const pino         = (await import('pino')).default;
    const logger       = pino({ level: 'silent' });

    // KEY FIX: fetch live WA version — stale pinned version causes code=405
    const version = await getWAVersion(baileysMod);

    const { state, saveCreds } = await useMongoAuthState();

    const sock = makeWASocket({
      version,
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

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

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
        reconnectCount = 0;
      }

      if (connection === 'close') {
        const err       = lastDisconnect?.error;
        const code      = err?.output?.statusCode;
        const loggedOut = code === 401;

        console.log('[baileys] disconnected code=' + code + ' loggedOut=' + loggedOut);

        baileysState  = { qr: null, status: 'DISCONNECTED', phone: '' };
        baileysSocket = null;
        isConnecting  = false;
        emitEvent('baileys_status', baileysState);

        if (loggedOut || code === 405) {
          // 401 = logged out, 405 = session rejected — both need fresh QR
          await clearMongoAuthState().catch(console.error);
          reconnectCount = 0;
          console.log(`[baileys] code=${code} — session rejected/logged out. Credentials cleared. Click Connect for a fresh QR.`);
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