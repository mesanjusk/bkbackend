import api from '../api';

export const whatsappService = {
  // ── Official Cloud API ────────────────────────────────────────────────────
  getConnections: () => api.get('/whatsapp/connections'),
  getTemplates: () => api.get('/whatsapp/templates'),
  getMessages: () => api.get('/whatsapp/messages'),
  getRecipients: () => api.get('/whatsapp/recipients'),
  getInbox: () => api.get('/whatsapp/inbox'),
  getConversation: (conversationKey) => api.get(`/whatsapp/conversation/${conversationKey}`),
  markConversationRead: (conversationKey) => api.post(`/whatsapp/conversation/${conversationKey}/read`),
  getRules: () => api.get('/whatsapp/auto-reply-rules'),
  saveRule: (payload, id) => id ? api.put(`/whatsapp/auto-reply-rules/${id}`, payload) : api.post('/whatsapp/auto-reply-rules', payload),
  sendText: (payload) => api.post('/whatsapp/send-text', payload),
  sendInvitation: (payload) => api.post('/whatsapp/send-invitation', payload),

  // ── Baileys (unofficial) ──────────────────────────────────────────────────
  baileysGetStatus: () => api.get('/baileys/status'),
  baileysConnect: () => api.post('/baileys/connect'),
  baileysDisconnect: () => api.post('/baileys/disconnect'),

  // Inbox / conversations
  baileysGetInbox: () => api.get('/baileys/inbox'),
  baileysGetConversation: (conversationKey) => api.get(`/baileys/conversation/${conversationKey}`),
  baileysMarkRead: (conversationKey) => api.post(`/baileys/conversation/${conversationKey}/read`),

  // Send
  baileysSendText: (payload) => api.post('/baileys/send-text', payload),

  // Auto-reply rules (same shape as Official)
  baileysGetRules: () => api.get('/baileys/auto-reply-rules'),
  baileysSaveRule: (payload, id) =>
    id
      ? api.put(`/baileys/auto-reply-rules/${id}`, payload)
      : api.post('/baileys/auto-reply-rules', payload),
  baileysDeleteRule: (id) => api.delete(`/baileys/auto-reply-rules/${id}`),

  // Invitation (image + text blast via Baileys)
  baileysSendInvitation: (payload) => api.post('/baileys/send-invitation', payload),

  // Logs (all BaileysMessage records flat)
  baileysGetLogs: () => api.get('/baileys/logs'),
};

export default whatsappService;
