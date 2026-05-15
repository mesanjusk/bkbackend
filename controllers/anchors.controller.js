const Anchor = require('../models/Anchor');
const BaileysMessage = require('../models/BaileysMessage');

// GET /anchors (protected)
async function getAnchors(req, res) {
  try {
    const docs = await Anchor.find()
      .select('_id firstName lastName fullName gender age mobile language instructionsAccepted editToken createdAt')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (error) {
    console.error('getAnchors error:', error);
    res.status(500).json({ message: 'Failed to fetch anchors' });
  }
}
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Notification = require('../models/Notification');
const { emitEvent } = require('../services/socket');
const { sendTemplateMessage } = require('../services/whatsappService');
const baileysService = require('../services/baileysService');
const { getSettingValue } = require('./systemSettingsController');

function normalizePhone(raw) {
  return String(raw || '').replace(/[^\d]/g, '').trim();
}

function toWhatsAppNumber(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return '';
  if (digits.length >= 11) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function queueAnchorConfirmation(anchor) {
  if (!anchor.mobile) return;

  let provider = 'baileys';
  try {
    provider = await getSettingValue('registration_whatsapp_provider', 'baileys');
  } catch (e) {
    console.error('[queueAnchorConfirmation] Could not read provider setting, defaulting to baileys:', e.message);
  }

  const useBaileys       = provider !== 'official';
  const mobileForBaileys = toWhatsAppNumber(anchor.mobile);
  const languageDisplay  = Array.isArray(anchor.language) ? anchor.language.join(', ') : anchor.language || '-';

  const confirmationText =
    `✅ *Anchor Registration Confirmed!*\n` +
    `*BK Scholar Awards 2026*\n\n` +
    `*Name:* ${anchor.fullName}\n` +
    `*Age:* ${anchor.age || '-'}\n` +
    `*Language(s):* ${languageDisplay}\n` +
    `*Mobile:* ${anchor.mobile}\n\n` +
    `Thank you for registering as an Anchor for Badte Kadam Scholar Awards 2026.\n` +
    `This is an audition registration — auditions are scheduled on *24 May 2026*.\n` +
    `We will contact you with further details. 🎤🙏`;

  console.log(
    `[queueAnchorConfirmation] provider=${provider} mobile=${anchor.mobile} wa=${mobileForBaileys}`
  );

  try {
    if (useBaileys) {
      const baileysStatus = baileysService.getStatus();
      if (baileysStatus.status !== 'CONNECTED') {
        throw new Error(`Baileys not connected (status: ${baileysStatus.status})`);
      }

      await baileysService.sendText({ to: mobileForBaileys, body: confirmationText });

      await BaileysMessage.create({
        to:              mobileForBaileys,
        from:            '',
        contactName:     anchor.fullName,
        conversationKey: mobileForBaileys,
        direction:       'OUTGOING',
        source:          'AUTO',
        messageType:     'TEXT',
        bodyText:        confirmationText,
        status:          'SENT',
        meta:            { trigger: 'anchor_registration_confirmation', provider: 'baileys' }
      }).catch(() => null);

    } else {
      await sendTemplateMessage({
        to:             anchor.mobile,
        templateName:   'bk_award',
        languageCode:   process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
        bodyParameters: [anchor.fullName],
        buttonParameters: []
      });

      await WhatsAppMessage.create({
        to:               anchor.mobile,
        templateName:     'bk_award',
        messageType:      'TEMPLATE',
        status:           'SENT',
        relatedEntityType: 'Anchor',
        relatedEntityId:  String(anchor._id),
        bodyText:         confirmationText
      }).catch(() => null);
    }

    await Notification.create({
      title:       'Anchor confirmation sent',
      message:     `Registration confirmation sent for ${anchor.fullName} via ${useBaileys ? 'Baileys' : 'Official API'}`,
      type:        'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);

    anchor.whatsappConfirmationSentAt = new Date();
    await anchor.save();

    emitEvent('whatsapp_message_logged', { to: anchor.mobile, anchorId: anchor._id });

  } catch (error) {
    console.error('[queueAnchorConfirmation] error:', error?.response?.data || error.message);

    if (useBaileys) {
      console.log('[queueAnchorConfirmation] Baileys failed — attempting Official API fallback…');
      try {
        await sendTemplateMessage({
          to:             anchor.mobile,
          templateName:   'bk_award',
          languageCode:   process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
          bodyParameters: [anchor.fullName],
          buttonParameters: []
        });

        await WhatsAppMessage.create({
          to:               anchor.mobile,
          templateName:     'bk_award',
          messageType:      'TEMPLATE',
          status:           'SENT',
          relatedEntityType: 'Anchor',
          relatedEntityId:  String(anchor._id),
          bodyText:         confirmationText
        }).catch(() => null);

        console.log('[queueAnchorConfirmation] Official API fallback succeeded');

        anchor.whatsappConfirmationSentAt = new Date();
        await anchor.save();
        emitEvent('whatsapp_message_logged', { to: anchor.mobile, anchorId: anchor._id });
        return;
      } catch (fallbackErr) {
        console.error('[queueAnchorConfirmation] Official API fallback also failed:', fallbackErr.message);
      }
    }

    if (useBaileys) {
      await BaileysMessage.create({
        to:              mobileForBaileys,
        contactName:     anchor.fullName,
        conversationKey: mobileForBaileys,
        direction:       'OUTGOING',
        source:          'AUTO',
        messageType:     'TEXT',
        bodyText:        confirmationText,
        status:          'FAILED',
        meta:            { trigger: 'anchor_registration_confirmation', provider: 'baileys', error: error.message }
      }).catch(() => null);
    } else {
      await WhatsAppMessage.create({
        to:               anchor.mobile,
        templateName:     'bk_award',
        messageType:      'TEMPLATE',
        status:           'FAILED',
        relatedEntityType: 'Anchor',
        relatedEntityId:  String(anchor._id),
        bodyText:         `Failed to send registration confirmation to ${anchor.fullName}`
      }).catch(() => null);
    }

    await Notification.create({
      title:       'Anchor confirmation failed',
      message:     `Registration confirmation failed for ${anchor.fullName}`,
      type:        'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);
  }
}

async function sendAnchorGroupNotification(anchor) {
  try {
    const groupJid = await getSettingValue('anchor_registration_group_jid', '');
    if (!groupJid) return;
    const baileysStatus = baileysService.getStatus();
    if (baileysStatus.status !== 'CONNECTED') return;
    const languageDisplay = Array.isArray(anchor.language) ? anchor.language.join(', ') : anchor.language || '-';
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const message =
      `🎤 *New Anchor Registration*\n` +
      `*Name:* ${anchor.fullName}\n` +
      `*Age:* ${anchor.age || '-'}\n` +
      `*Language(s):* ${languageDisplay}\n` +
      `*Mobile:* ${anchor.mobile}\n` +
      `*Time:* ${now}`;
    await baileysService.sendText({ to: groupJid, body: message });
  } catch (e) {
    console.error('[sendAnchorGroupNotification] error:', e.message);
  }
}

// POST /anchors/public-register
async function publicRegister(req, res) {
  try {
    const normalizedMobile = normalizePhone(req.body.mobile);

    const duplicate = await Anchor.findOne({
      mobile: { $in: [normalizedMobile, `91${normalizedMobile}`, normalizedMobile.replace(/^91/, '')] }
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        duplicate:  true,
        editToken:  duplicate.editToken || null,
        anchorId:   String(duplicate._id),
        message:
          `An anchor registration already exists for this mobile number. ` +
          `${duplicate.editToken
            ? 'You can edit your existing registration using the link below.'
            : 'Please contact us if you need to make changes.'}`
      });
    }

    const fullName = String(req.body.fullName || [req.body.firstName, req.body.lastName].filter(Boolean).join(' ') || '').trim();

    const doc = await Anchor.create({
      firstName:            String(req.body.firstName || '').trim(),
      lastName:             String(req.body.lastName  || '').trim(),
      fullName:             fullName || undefined,
      gender:               String(req.body.gender   || '').trim(),
      age:                  req.body.age ? Number(req.body.age) : null,
      address:              String(req.body.address  || '').trim(),
      mobile:               normalizedMobile || String(req.body.mobile || '').trim(),
      language:             Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
      instructionsAccepted: req.body.instructionsAccepted !== false
    });

    queueAnchorConfirmation(doc).catch((e) =>
      console.error('[publicRegister] queueAnchorConfirmation error:', e.message)
    );

    sendAnchorGroupNotification(doc).catch(() => null);

    emitEvent('anchor_public_registered', { anchorId: doc._id, fullName: doc.fullName });

    res.status(201).json({
      message:   'Registration successful',
      anchorId:  String(doc._id),
      editToken: doc.editToken || null
    });

  } catch (error) {
    console.error('publicRegister error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to submit registration' });
  }
}

// GET /anchors/public-edit/:token
async function getPublicEdit(req, res) {
  try {
    const doc = await Anchor.findOne({ editToken: req.params.token });
    if (!doc) return res.status(404).json({ message: 'Anchor registration not found' });
    res.json(doc);
  } catch (error) {
    console.error('getPublicEdit error:', error);
    res.status(500).json({ message: 'Failed to fetch anchor registration' });
  }
}

// PUT /anchors/public-edit/:token
async function putPublicEdit(req, res) {
  try {
    const doc = await Anchor.findOne({ editToken: req.params.token });
    if (!doc) return res.status(404).json({ message: 'Anchor registration not found' });

    const fields = ['firstName', 'lastName', 'fullName', 'gender', 'age', 'address', 'mobile', 'language', 'instructionsAccepted'];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        doc[field] = req.body[field];
      }
    }

    await doc.save();

    emitEvent('anchor_public_updated', { anchorId: doc._id, fullName: doc.fullName });

    res.json(doc);
  } catch (error) {
    console.error('putPublicEdit error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update anchor registration' });
  }
}

module.exports = { getAnchors, publicRegister, getPublicEdit, putPublicEdit };
