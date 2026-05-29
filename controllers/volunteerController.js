const mongoose = require('mongoose');
const Volunteer = require('../models/Volunteer');
const Category = require('../models/Category');
const BaileysMessage = require('../models/BaileysMessage');
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

function buildFullName(body = {}) {
  return [body.firstName, body.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

async function getPublicTeams(req, res) {
  try {
    const docs = await Category.find({ categoryType: 'VOLUNTEER_TEAM', isActive: true })
      .select('_id title categoryType')
      .sort({ title: 1 });
    res.json(docs.map((item) => ({ _id: item._id, name: item.title, categoryType: item.categoryType })));
  } catch (error) {
    console.error('getPublicTeams error:', error);
    res.status(500).json({ message: 'Failed to fetch volunteer teams' });
  }
}

async function queueVolunteerConfirmation(volunteer, teamName = '') {
  if (!volunteer.mobile) return;

  let provider = 'baileys';
  try {
    provider = await getSettingValue('registration_whatsapp_provider', 'baileys');
  } catch (e) {
    console.error('[queueVolunteerConfirmation] Could not read provider setting, defaulting to baileys:', e.message);
  }

  const useBaileys = provider !== 'official';
  const mobileForBaileys = toWhatsAppNumber(volunteer.mobile);
  const teamDisplay = teamName || volunteer.teamOther || '-';

  const confirmationText =
    `✅ *Volunteer Registration Confirmed!*\n` +
    `*BK Scholar Awards 2026*\n\n` +
    `*Name:* ${volunteer.fullName}\n` +
    `*Team:* ${teamDisplay}\n` +
    `*Mobile:* ${volunteer.mobile}\n\n` +
    `Thank you for volunteering for Badte Kadam Scholar Awards 2026.\n` +
    `We will contact you with further details. 🙏`;

  console.log(
    `[queueVolunteerConfirmation] provider=${provider} mobile=${volunteer.mobile} wa=${mobileForBaileys}`
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
        contactName:     volunteer.fullName,
        conversationKey: mobileForBaileys,
        direction:       'OUTGOING',
        source:          'AUTO',
        messageType:     'TEXT',
        bodyText:        confirmationText,
        status:          'SENT',
        meta:            { trigger: 'volunteer_registration_confirmation', provider: 'baileys' }
      }).catch(() => null);

    } else {
      await sendTemplateMessage({
        to:               volunteer.mobile,
        templateName:     'bk_award',
        languageCode:     process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
        bodyParameters:   [volunteer.fullName],
        buttonParameters: []
      });

      await WhatsAppMessage.create({
        to:                volunteer.mobile,
        templateName:      'bk_award',
        messageType:       'TEMPLATE',
        status:            'SENT',
        relatedEntityType: 'Volunteer',
        relatedEntityId:   String(volunteer._id),
        bodyText:          confirmationText
      }).catch(() => null);
    }

    await Notification.create({
      title:       'Volunteer confirmation sent',
      message:     `Registration confirmation sent for ${volunteer.fullName} via ${useBaileys ? 'Baileys' : 'Official API'}`,
      type:        'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);

    volunteer.whatsappConfirmationSentAt = new Date();
    await volunteer.save();

    emitEvent('whatsapp_message_logged', { to: volunteer.mobile, volunteerId: volunteer._id });

  } catch (error) {
    console.error('[queueVolunteerConfirmation] error:', error?.response?.data || error.message);

    if (useBaileys) {
      console.log('[queueVolunteerConfirmation] Baileys failed — attempting Official API fallback…');
      try {
        await sendTemplateMessage({
          to:               volunteer.mobile,
          templateName:     'bk_award',
          languageCode:     process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
          bodyParameters:   [volunteer.fullName],
          buttonParameters: []
        });

        await WhatsAppMessage.create({
          to:                volunteer.mobile,
          templateName:      'bk_award',
          messageType:       'TEMPLATE',
          status:            'SENT',
          relatedEntityType: 'Volunteer',
          relatedEntityId:   String(volunteer._id),
          bodyText:          confirmationText
        }).catch(() => null);

        console.log('[queueVolunteerConfirmation] Official API fallback succeeded');

        volunteer.whatsappConfirmationSentAt = new Date();
        await volunteer.save();
        emitEvent('whatsapp_message_logged', { to: volunteer.mobile, volunteerId: volunteer._id });
        return;
      } catch (fallbackErr) {
        console.error('[queueVolunteerConfirmation] Official API fallback also failed:', fallbackErr.message);
      }
    }

    if (useBaileys) {
      await BaileysMessage.create({
        to:              mobileForBaileys,
        contactName:     volunteer.fullName,
        conversationKey: mobileForBaileys,
        direction:       'OUTGOING',
        source:          'AUTO',
        messageType:     'TEXT',
        bodyText:        confirmationText,
        status:          'FAILED',
        meta:            { trigger: 'volunteer_registration_confirmation', provider: 'baileys', error: error.message }
      }).catch(() => null);
    } else {
      await WhatsAppMessage.create({
        to:                volunteer.mobile,
        templateName:      'bk_award',
        messageType:       'TEMPLATE',
        status:            'FAILED',
        relatedEntityType: 'Volunteer',
        relatedEntityId:   String(volunteer._id),
        bodyText:          `Failed to send registration confirmation to ${volunteer.fullName}`
      }).catch(() => null);
    }

    await Notification.create({
      title:       'Volunteer confirmation failed',
      message:     `Registration confirmation failed for ${volunteer.fullName}`,
      type:        'WHATSAPP',
      targetRoles: ['ADMIN', 'SENIOR_TEAM']
    }).catch(() => null);
  }
}

async function sendVolunteerGroupNotification(volunteer, teamName = '') {
  try {
    const groupJid = await getSettingValue('volunteer_registration_group_jid', '');
    if (!groupJid) return;
    const baileysStatus = baileysService.getStatus();
    if (baileysStatus.status !== 'CONNECTED') return;
    const teamDisplay = teamName || volunteer.teamOther || '-';
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const message =
      `🙋 *New Volunteer Registration*\n` +
      `*Name:* ${volunteer.fullName}\n` +
      `*Team:* ${teamDisplay}\n` +
      `*Mobile:* ${volunteer.mobile}\n` +
      `*Time:* ${now}`;
    await baileysService.sendText({ to: groupJid, body: message });
  } catch (e) {
    console.error('[sendVolunteerGroupNotification] error:', e.message);
  }
}

async function createPublicVolunteer(req, res) {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const lastName  = String(req.body.lastName  || '').trim();
    const fullName  = String(req.body.fullName  || buildFullName(req.body)).trim();
    const mobile    = normalizePhone(req.body.mobile);
    const teamId    = String(req.body.teamId    || '').trim();
    const teamOther = String(req.body.teamOther || '').trim();

    if (!firstName || !lastName || !mobile) {
      return res.status(400).json({ message: 'First name, last name and mobile are required' });
    }

    let resolvedTeamId = null;
    let teamName = '';
    if (teamId) {
      if (!mongoose.Types.ObjectId.isValid(teamId)) {
        return res.status(400).json({ message: 'Invalid volunteer team category' });
      }
      const team = await Category.findById(teamId);
      if (!team) {
        return res.status(400).json({ message: 'Volunteer team category not found' });
      }
      resolvedTeamId = team._id;
      teamName = team.title || '';
    }

    const doc = await Volunteer.create({
      firstName,
      lastName,
      fullName,
      gender:   String(req.body.gender   || '').trim(),
      address:  String(req.body.address  || '').trim(),
      mobile,
      teamId:    resolvedTeamId,
      teamOther: resolvedTeamId ? '' : teamOther,
      photoUrl:  String(req.body.photoUrl  || '').trim(),
      remarks:   String(req.body.remarks   || '').trim()
    });

    queueVolunteerConfirmation(doc, teamName).catch((e) =>
      console.error('[createPublicVolunteer] queueVolunteerConfirmation error:', e.message)
    );

    sendVolunteerGroupNotification(doc, teamName).catch(() => null);

    emitEvent('volunteer_public_registered', { volunteerId: doc._id, fullName: doc.fullName });

    res.status(201).json({
      message:     'Volunteer registration submitted successfully',
      volunteerId: String(doc._id)
    });
  } catch (error) {
    console.error('createPublicVolunteer error:', error);
    res.status(500).json({ message: error.message || 'Failed to submit volunteer registration' });
  }
}

async function resendVolunteerOtp(req, res) {
  try {
    const mobile = normalizePhone(req.body.mobile);
    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    const doc = await Volunteer.findOne({
      mobile: { $in: [mobile, `91${mobile}`, mobile.replace(/^91/, '')] }
    }).populate('teamId');

    if (!doc) {
      return res.status(404).json({ message: 'No volunteer registration found for this mobile number' });
    }

    const teamName = doc.teamId?.title || '';

    queueVolunteerConfirmation(doc, teamName).catch((e) =>
      console.error('[resendVolunteerOtp] queueVolunteerConfirmation error:', e.message)
    );

    res.json({ message: 'Confirmation message resent successfully' });
  } catch (error) {
    console.error('resendVolunteerOtp error:', error);
    res.status(500).json({ message: error.message || 'Failed to resend confirmation' });
  }
}

module.exports = { getPublicTeams, createPublicVolunteer, resendVolunteerOtp };
