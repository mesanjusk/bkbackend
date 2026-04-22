const axios = require('axios');

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';

async function sendTemplateMessage({
  to,
  templateName,
  languageCode = 'en_US',
  headerImageUrl = '',
  bodyParameters = [],
  buttonParameters = []
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !to) {
    return { skipped: true, reason: 'Missing WhatsApp config or recipient' };
  }

  const components = [];

  if (headerImageUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: { link: headerImageUrl }
        }
      ]
    });
  }

  if (Array.isArray(bodyParameters) && bodyParameters.length) {
    components.push({
      type: 'body',
      parameters: bodyParameters.map((text) => ({
        type: 'text',
        text: String(text || '')
      }))
    });
  }

  if (Array.isArray(buttonParameters) && buttonParameters.length) {
    buttonParameters.forEach((button) => {
      components.push({
        type: 'button',
        sub_type: button.sub_type || 'url',
        index: String(button.index ?? 0),
        parameters: Array.isArray(button.parameters) ? button.parameters : []
      });
    });
  }

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
