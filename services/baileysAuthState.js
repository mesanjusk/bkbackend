/**
 * MongoDB-backed Baileys auth state adapter.
 *
 * Replaces `useMultiFileAuthState` (which writes to disk) with a version
 * that reads/writes from MongoDB — safe on ephemeral hosts like Render.
 *
 * Usage:
 *   const { state, saveCreds } = await useMongoAuthState();
 *   // then pass state to makeWASocket exactly as you would with useMultiFileAuthState
 */

const BaileysAuthState = require('../models/BaileysAuthState');

// Keys Baileys uses
const CREDS_KEY = 'baileys:creds';
const KEYS_PREFIX = 'baileys:keys:';

async function readData(key) {
  const doc = await BaileysAuthState.findOne({ dataKey: key }).lean();
  return doc ? doc.dataValue : null;
}

async function writeData(key, value) {
  await BaileysAuthState.findOneAndUpdate(
    { dataKey: key },
    { $set: { dataValue: value } },
    { upsert: true, new: true }
  );
}

async function removeData(key) {
  await BaileysAuthState.deleteOne({ dataKey: key });
}

async function useMongoAuthState() {
  // Load or initialise credentials
  let creds = await readData(CREDS_KEY);

  // We need initAuthCreds from Baileys — import lazily
  const { initAuthCreds, BufferJSON, proto } = await import('@whiskeysockets/baileys');

  if (!creds) {
    creds = initAuthCreds();
    await writeData(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  } else {
    // Revive buffers that were serialised to JSON
    creds = JSON.parse(JSON.stringify(creds), BufferJSON.reviver);
  }

  const keys = {
    get: async (type, ids) => {
      const data = {};
      await Promise.all(
        ids.map(async (id) => {
          const raw = await readData(`${KEYS_PREFIX}${type}:${id}`);
          if (!raw) return;
          let value = JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
          // pre-keys need to be proto objects
          if (type === 'pre-key') {
            value = proto.PreKey.fromObject(value);
          } else if (type === 'session') {
            value = proto.SessionStructure.fromObject(value);
          } else if (type === 'sender-key') {
            value = proto.SenderKeyRecord.fromObject(value);
          } else if (type === 'app-state-sync-key') {
            value = proto.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        })
      );
      return data;
    },

    set: async (data) => {
      const tasks = [];
      for (const [type, ids] of Object.entries(data)) {
        for (const [id, value] of Object.entries(ids || {})) {
          const key = `${KEYS_PREFIX}${type}:${id}`;
          if (value) {
            tasks.push(writeData(key, JSON.parse(JSON.stringify(value, BufferJSON.replacer))));
          } else {
            tasks.push(removeData(key));
          }
        }
      }
      await Promise.all(tasks);
    },
  };

  const state = { creds, keys };

  const saveCreds = async () => {
    await writeData(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  };

  return { state, saveCreds };
}

async function clearMongoAuthState() {
  await BaileysAuthState.deleteMany({ dataKey: { $regex: /^baileys:/ } });
}

module.exports = { useMongoAuthState, clearMongoAuthState };
