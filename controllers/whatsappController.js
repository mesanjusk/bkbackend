const WhatsAppMessage = require('../models/WhatsAppMessage');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const Volunteer = require('../models/Volunteer');
const User = require('../models/User');
const { emitEvent } = require('../services/socket');
const {
  sendTemplateMessage,
  sendTextMessage,
  uploadWhatsAppMedia
} = require('../services/whatsappService');

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

function uniqueRecipients(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const mobile = normalizePhone(item.mobile);
    if (!mobile || seen.has(mobile)) return false;
    seen.add(mobile);
    item.mobile = mobile;
    return true;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function generateImageWithName(baseUrl, name, pos = {}) {
  if (!baseUrl || !String(baseUrl).includes('/upload/')) return baseUrl;

  const safeName = String(name || 'Guest').trim() || 'Guest';
  const encodedText = encodeURIComponent(safeName);

  const color = String(pos?.color || '#000000').replace('#', '') || '000000';

  const originalWidth = Number(pos?.imageWidth) > 0 ? Number(pos.imageWidth) : 0;
  const originalHeight = Number(pos?.imageHeight) > 0 ? Number(pos.imageHeight) : 0;
  const previewWidth = Number(pos?.previewWidth) > 0 ? Number(pos.previewWidth) : 0;
  const previewHeight = Number(pos?.previewHeight) > 0 ? Number(pos.previewHeight) : 0;

  let x = 150;
  let y = 200;
  let fontSize = Number(pos?.fontSize) > 0 ? Number(pos.fontSize) : 30;

  const hasPercentPosition =
    Number.isFinite(Number(pos?.xPercent)) &&
    Number.isFinite(Number(pos?.yPercent));

  if (hasPercentPosition && originalWidth > 0 && originalHeight > 0) {
    const xPercent = clamp(Number(pos.xPercent), 0, 0.98);
    const yPercent = clamp(Number(pos.yPercent), 0, 0.98);

    x = Math.round(originalWidth * xPercent);
    y = Math.round(originalHeight * yPercent);

    if (Number(pos?.fontSize) > 0 && previewWidth > 0) {
      fontSize = Math.max(
        12,
        Math.round((Number(pos.fontSize) / previewWidth) * originalWidth)
      );
    }
  } else {
    x = Number.isFinite(Number(pos?.x)) ? Math.round(Number(pos.x)) : 150;
    y = Number.isFinite(Number(pos?.y)) ? Math.round(Number(pos.y)) : 200;
    fontSize = Number(pos?.fontSize) > 0 ? Number(pos.fontSize) : 30;
  }

  return baseUrl.replace(
    '/upload/',
    `/upload/l_text:Arial_${fontSize}_bold:${encodedText},co_rgb:${color},g_north_west,x_${x},y_${y}/`
  );
}

async function sendText(req, res) {
  const { to, text, templateName } = req.body;
  let providerResponse = null;

  try {
    if (templateName) {
      providerResponse = await sendTemplateMessage({
        to,
        templateName,
        languageCode: 'en_US'
      });
    } else if (text) {
      providerResponse = await sendTextMessage({ to, body: text });
    }
  } catch (error) {
    const failureLog = await WhatsAppMessage.create({
      to,
      bodyText: text || '',
      templateName: templateName || '',
      messageType: templateName ? 'TEMPLATE' : 'TEXT',
      status: 'FAILED',
      meta: { error: error?.response?.data || error.message }
    });
    return res.status(500).json(failureLog);
  }

  const log = await WhatsAppMessage.create({
    to,
    bodyText: text || '',
    templateName: templateName || '',
    messageType: templateName ? 'TEMPLATE' : 'TEXT',
    status: providerResponse?.messages?.length ? 'SENT' : 'QUEUED',
    meta: providerResponse || {}
  });

  await Notification.create({
    title: 'WhatsApp message queued',
    message: `WhatsApp ${templateName ? 'template' : 'text'} sent to ${to}`,
    type: 'WHATSAPP',
    targetRoles: ['ADMIN', 'SENIOR_TEAM']
  });

  emitEvent('whatsapp_message_logged', log);
  emitEvent('notification_created', { type: 'WHATSAPP', to });
  res.status(201).json(log);
}

async function getRecipients(req, res) {
  const [students, volunteers, parents, teamMembers, guests] = await Promise.all([
    Student.find({}, 'fullName mobile schoolName className').sort({ fullName: 1 }).lean(),
    Volunteer.find({}, 'fullName mobile teamOther').sort({ fullName: 1 }).lean(),
    Student.find({}, 'fullName parentMobile schoolName className').sort({ fullName: 1 }).lean(),
    User.find(
      {
        isActive: true,
        eventDutyType: { $in: ['VOLUNTEER', 'TEAM_LEADER', 'SENIOR_TEAM', 'ADMIN', 'HOST', 'CERTIFICATE_TEAM'] }
      },
      'name mobile eventDutyType'
    ).sort({ name: 1 }).lean(),
    User.find({ isActive: true, eventDutyType: 'GUEST' }, 'name mobile eventDutyType').sort({ name: 1 }).lean()
  ]);

  res.json({
    students: uniqueRecipients(students.map((item) => ({
      name: item.fullName,
      mobile: item.mobile,
      source: 'STUDENT',
      meta: { schoolName: item.schoolName || '', className: item.className || '' }
    }))),

    parents: uniqueRecipients(parents.map((item) => ({
      name: `${item.fullName} Parent`,
      mobile: item.parentMobile,
      source: 'PARENT',
      meta: { studentName: item.fullName, schoolName: item.schoolName || '', className: item.className || '' }
    }))),

    teamMembers: uniqueRecipients(teamMembers.map((item) => ({
      name: item.name,
      mobile: item.mobile,
      source: 'TEAM_MEMBER',
      meta: { dutyType: item.eventDutyType || '' }
    }))),

    volunteers: uniqueRecipients(volunteers.map((item) => ({
      name: item.fullName,
      mobile: item.mobile,
      source: 'VOLUNTEER',
      meta: { team: item.teamOther || '' }
    }))),

    guests: uniqueRecipients(guests.map((item) => ({
      name: item.name,
      mobile: item.mobile,
      source: 'GUEST',
      meta: { dutyType: item.eventDutyType || '' }
    })))
  });
}

async function sendInvitation(req, res) {
  const {
    imageUrl,
    eventName,
    date,
    time,
    venue,
    textPosition,
    recipients = []
  } = req.body;

  const missingFields = [];
  if (!String(imageUrl || '').trim()) missingFields.push('imageUrl');
  if (!String(eventName || '').trim()) missingFields.push('eventName');
  if (!String(date || '').trim()) missingFields.push('date');
  if (!String(time || '').trim()) missingFields.push('time');
  if (!String(venue || '').trim()) missingFields.push('venue');

  if (missingFields.length) {
    return res.status(400).json({
      message: 'Required fields are missing',
      missingFields
    });
  }

  const cleanRecipients = uniqueRecipients(
    (Array.isArray(recipients) ? recipients : []).map((item) => ({
      name: String(item?.name || item?.fullName || 'Guest').trim() || 'Guest',
      mobile: item?.mobile || item?.phone || item?.number || item?.whatsapp,
      source: item?.source || 'CUSTOM'
    }))
  ).filter((item) => String(item.mobile || '').length >= 10);

  if (!cleanRecipients.length) {
    return res.status(400).json({
      message: 'At least one valid recipient is required',
      receivedRecipients: Array.isArray(recipients) ? recipients.length : 0
    });
  }

  const results = [];

  for (const recipient of cleanRecipients) {
    let finalImage = imageUrl;
    let uploadedMediaId = '';

    try {
      finalImage = generateImageWithName(
        imageUrl,
        String(recipient.name || '').trim(),
        textPosition
      );

      const mediaUpload = await uploadWhatsAppMedia({
        fileUrl: finalImage
      });
      uploadedMediaId = mediaUpload?.id || '';

      console.log(
        '[whatsapp] uploaded personalized media for template header',
        JSON.stringify(
          {
            originalImageUrl: imageUrl,
            finalImage,
            mediaId: uploadedMediaId,
            recipientName: recipient.name,
            recipientMobile: recipient.mobile,
            textPosition
          },
          null,
          2
        )
      );

      const payloadPreview = {
        to: recipient.mobile,
        templateName: 'entry_pass',
        languageCode: 'en_US',
        headerImageId: uploadedMediaId,
        bodyParameters: [
          String(recipient.name || '').trim(),
          String(eventName || '').trim(),
          String(date || '').trim(),
          String(time || '').trim(),
          String(venue || '').trim()
        ],
        buttonParameters: [
          {
            sub_type: 'quick_reply',
            index: 0,
            parameters: [{ type: 'payload', payload: 'Going' }]
          },
          {
            sub_type: 'quick_reply',
            index: 1,
            parameters: [{ type: 'payload', payload: 'Not Sure' }]
          },
          {
            sub_type: 'quick_reply',
            index: 2,
            parameters: [{ type: 'payload', payload: 'Not Going' }]
          }
        ]
      };

      console.error(
        '[whatsapp] entry_pass payload full',
        JSON.stringify(payloadPreview, null, 2)
      );

      const providerResponse = await sendTemplateMessage({
        to: recipient.mobile,
        templateName: 'entry_pass',
        languageCode: 'en_US',
        headerImageId: uploadedMediaId,
        bodyParameters: [
          String(recipient.name || '').trim(),
          String(eventName || '').trim(),
          String(date || '').trim(),
          String(time || '').trim(),
          String(venue || '').trim()
        ],
        buttonParameters: [
          {
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              { type: 'payload', payload: 'Going' }
            ]
          },
          {
            sub_type: 'quick_reply',
            index: 1,
            parameters: [
              { type: 'payload', payload: 'Not Sure' }
            ]
          },
          {
            sub_type: 'quick_reply',
            index: 2,
            parameters: [
              { type: 'payload', payload: 'Not Going' }
            ]
          }
        ]
      });

      const log = await WhatsAppMessage.create({
        to: recipient.mobile,
        bodyText: `Entry pass for ${eventName}`,
        templateName: 'entry_pass',
        messageType: 'TEMPLATE',
        status: providerResponse?.messages?.length ? 'SENT' : 'QUEUED',
        meta: {
          providerResponse,
          recipientName: recipient.name,
          recipientSource: recipient.source,
          invitation: {
            imageUrl,
            finalImage,
            uploadedMediaId,
            eventName,
            date,
            time,
            venue,
            textPosition: textPosition || null
          }
        }
      });

      results.push({
        mobile: recipient.mobile,
        name: recipient.name,
        source: recipient.source,
        status: log.status,
        ok: true
      });
    } catch (error) {
      console.error(
        '[whatsapp] entry_pass send failed full',
        JSON.stringify(error?.response?.data || { message: error.message }, null, 2)
      );

      console.error(
        '[whatsapp] entry_pass send failed summary',
        JSON.stringify(
          {
            to: recipient.mobile,
            name: recipient.name,
            source: recipient.source,
            uploadedMediaId,
            originalImageUrl: imageUrl,
            finalImage,
            eventName,
            date,
            time,
            venue,
            textPosition: textPosition || null,
            status: error?.response?.status
          },
          null,
          2
        )
      );

      await WhatsAppMessage.create({
        to: recipient.mobile,
        bodyText: `Entry pass for ${eventName}`,
        templateName: 'entry_pass',
        messageType: 'TEMPLATE',
        status: 'FAILED',
        meta: {
          recipientName: recipient.name,
          recipientSource: recipient.source,
          invitation: {
            imageUrl,
            finalImage,
            uploadedMediaId,
            eventName,
            date,
            time,
            venue,
            textPosition: textPosition || null
          },
          error: error?.response?.data || error.message
        }
      });

      results.push({
        mobile: recipient.mobile,
        name: recipient.name,
        source: recipient.source,
        status: 'FAILED',
        ok: false,
        error: error?.response?.data?.error?.message || error.message
      });
    }
  }

  emitEvent('whatsapp_invitation_sent', {
    total: results.length,
    success: results.filter((r) => r.ok).length
  });

  res.status(201).json({
    total: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results
  });
}

module.exports = { sendText, getRecipients, sendInvitation };