import { prisma } from '../../db/prisma.js';
import type { UserSettings } from '../../generated/prisma/client.js';
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
