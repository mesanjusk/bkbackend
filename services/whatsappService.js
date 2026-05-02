const axios = require('axios');
const FormData = require('form-data');

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';

async function uploadWhatsAppMedia({ fileUrl, mimeType = 'image/jpeg' }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !fileUrl) {
    throw new Error('Missing WhatsApp config or fileUrl for media upload');
  }

  const fileResponse = await axios.get(fileUrl, {
    responseType: 'stream'
  });

  const contentType = fileResponse.headers['content-type'] || mimeType;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', contentType);
  form.append('file', fileResponse.data, {
    filename: `header.${contentType.includes('png') ? 'png' : 'jpg'}`,
    contentType
  });

  const { data } = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity
    }
  );

  return data; // { id: 'MEDIA_ID' }
}

async function sendTemplateMessage({
  to,
  templateName,
  languageCode = 'en_US',
  headerImageUrl = '',
  headerImageId = '',
  bodyParameters = [],
  buttonParameters = []
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !to) {
    return { skipped: true, reason: 'Missing WhatsApp config or recipient' };
  }

  const components = [];

  if (headerImageId || headerImageUrl) {
    const imageObject = headerImageId
      ? { id: headerImageId }
      : { link: headerImageUrl };

    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: imageObject
        }
      ]
    });
  }

  if (Array.isArray(bodyParameters) && bodyParameters.length) {
    components.push({
      type: 'body',
      parameters: bodyParameters.map((text) => ({
        type: 'text',
        text: String(text || '').trim()
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

  console.log(
    '[whatsapp] sending template',
    JSON.stringify({
      to,
      templateName,
      languageCode,
      hasHeaderImage: Boolean(headerImageUrl || headerImageId),
      usingHeaderImageId: Boolean(headerImageId),
      bodyParameterCount: Array.isArray(bodyParameters) ? bodyParameters.length : 0,
      buttonParameterCount: Array.isArray(buttonParameters) ? buttonParameters.length : 0,
      payload
    })
  );

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
  uploadWhatsAppMedia,
  sendTemplateMessage,
  sendTextMessage
};