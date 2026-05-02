/**
 * MongoDB-backed Baileys auth state.
 * 
 * IMPORTANT: Signal protocol keys (pre-key, session, sender-key, etc.) must be
 * stored and retrieved as plain JS objects / Buffers — NOT proto instances.
 * Wrapping them in proto.X.fromObject() breaks the Noise handshake and causes
 * "couldn't link device" errors on every scan.
 *
 * This adapter keeps an in-memory write-through cache so key lookups during
 * the QR handshake (which are synchronous bursts) never lag on DB round-trips.
 */

const BaileysAuthState = require('../models/BaileysAuthState');

const CREDS_KEY  = 'baileys_creds';
const KEY_PREFIX = 'baileys_key_';

// In-memory cache — write-through, cleared on disconnect
const memCache = new Map();

// ── low-level DB helpers ──────────────────────────────────────────────────────

async function dbRead(key) {
  if (memCache.has(key)) return memCache.get(key);
  const doc = await BaileysAuthState.findOne({ dataKey: key }).lean();
  const val = doc ? doc.dataValue : null;
  if (val !== null) memCache.set(key, val);
  return val;
}

async function dbWrite(key, value) {
  memCache.set(key, value);
  await BaileysAuthState.findOneAndUpdate(
    { dataKey: key },
    { $set: { dataValue: value } },
    { upsert: true }
  );
}

async function dbDelete(key) {
  memCache.delete(key);
  await BaileysAuthState.deleteOne({ dataKey: key });
}

// ── main export ───────────────────────────────────────────────────────────────

async function useMongoAuthState() {
  // Lazy-import so server boots even if baileys isn't installed yet
  const { initAuthCreds, BufferJSON } = await import('@whiskeysockets/baileys');

  // ── credentials (one document) ─────────────────────────────────────────────
  let rawCreds = await dbRead(CREDS_KEY);
  let creds;

  if (!rawCreds) {
    creds = initAuthCreds();
    await dbWrite(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  } else {
    // Revive Buffer fields (e.g. signedIdentityKey, signedPreKey …)
    creds = JSON.parse(JSON.stringify(rawCreds), BufferJSON.reviver);
  }

  // ── signal keys (many documents, one per type:id pair) ────────────────────
  const keys = {
    /**
     * get(type, ids) → { [id]: value }
     * Values must be plain objects — Baileys' own signal layer handles the
     * protobuf encoding internally. Do NOT call proto.X.fromObject() here.
     */
    get: async (type, ids) => {
      const result = {};
      await Promise.all(
        ids.map(async (id) => {
          const dbKey = `${KEY_PREFIX}${type}_${id}`;
          const raw   = await dbRead(dbKey);
          if (raw == null) return;
          // Revive Buffers (e.g. pre-key public/private bytes)
          result[id] = JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
        })
      );
      return result;
    },

    /**
     * set(data) — data is { [type]: { [id]: value | null } }
     * null value means delete.
     */
    set: async (data) => {
      const writes = [];
      for (const [type, idMap] of Object.entries(data)) {
        for (const [id, value] of Object.entries(idMap ?? {})) {
          const dbKey = `${KEY_PREFIX}${type}_${id}`;
          if (value != null) {
            writes.push(
              dbWrite(dbKey, JSON.parse(JSON.stringify(value, BufferJSON.replacer)))
            );
          } else {
            writes.push(dbDelete(dbKey));
          }
        }
      }
      await Promise.all(writes);
    },
  };

  // saveCreds is called by Baileys whenever creds mutate
  const saveCreds = async () => {
    await dbWrite(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  };

  return { state: { creds, keys }, saveCreds };
}

async function clearMongoAuthState() {
  memCache.clear();
  // Delete all baileys docs from MongoDB
  await BaileysAuthState.deleteMany({
    dataKey: { $in: [CREDS_KEY] }
  });
  await BaileysAuthState.deleteMany({
    dataKey: { $regex: `^${KEY_PREFIX}` }
  });
}

module.exports = { useMongoAuthState, clearMongoAuthState };
