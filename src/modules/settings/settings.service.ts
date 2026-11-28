import { prisma } from '../../db/prisma.js';
import type { User, UserSettings } from '../../generated/prisma/client.js';
import { conflict, forbidden } from '../../lib/errors.js';
import { toUserDto } from '../users/user.mapper.js';
import { findUserByPhone } from '../users/user.service.js';
import type { UpdateSettingsInput } from './settings.schemas.js';

/** Settings as the apps see them (matches `UserSettings` in the dashboard types). */
function toSettingsDto(settings: UserSettings) {
  return {
    language: settings.language,
    jobAlerts: settings.jobAlerts,
    smsAlerts: settings.smsAlerts,
    whatsappAlerts: settings.whatsappAlerts,
    visibleToEmployers: settings.visibleToEmployers,
  };
}

export async function getSettings(userId: string) {
  // Created at sign-up; upsert also covers older accounts without a row.
  const settings = await prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  return toSettingsDto(settings);
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  return toSettingsDto(settings);
}

/**
 * Worker adds or changes their mobile number (welcome step, or later in the profile).
 * Not checked by SMS: login is by email or Google, the number is only for companies to call.
 * One number per account, so HR never calls the wrong person.
 */
export async function setPhone(user: User, phone: string) {
  if (user.role !== 'worker') throw forbidden('Only job seekers add a mobile number here.');
  if (user.phone === phone) return toUserDto(user);

  const owner = await findUserByPhone(phone);
  if (owner) throw conflict('This mobile number is already used by another account.', 'PHONE_TAKEN');
  try {
    return toUserDto(await prisma.user.update({ where: { id: user.id }, data: { phone } }));
  } catch (error) {
    // Someone saved the same number at the same moment.
    if (await findUserByPhone(phone)) {
      throw conflict('This mobile number is already used by another account.', 'PHONE_TAKEN');
    }
    throw error;
  }
}
