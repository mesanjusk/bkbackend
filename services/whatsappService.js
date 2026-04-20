const axios = require('axios');

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';

async function sendTemplateMessage({ to, templateName, languageCode = 'en_US', bodyParameters = [] }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !to) {
    return { skipped: true, reason: 'Missing WhatsApp config or recipient' };
  }

  const components = bodyParameters.length
    ? [
        {
          type: 'body',
          parameters: bodyParameters.map((text) => ({ type: 'text', text: String(text) }))
        }
      ]
    : [];

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {})
    }
  };

  const { data } = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return data;
}

async function sendTextMessage({ to, body }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !to || !body) {
    return { skipped: true, reason: 'Missing WhatsApp config or recipient/body' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body }
  };

  const { data } = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return data;
}

module.exports = {
  sendTemplateMessage,
  sendTextMessage
};