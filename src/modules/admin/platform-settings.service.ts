import { prisma } from '../../db/prisma.js';
import type { PlatformSettings } from '../../generated/prisma/client.js';
import { recordAudit } from './audit.service.js';

export type PlatformSettingsInput = Partial<
  Pick<PlatformSettings, 'autoApproveCompanies' | 'messagingEnabled' | 'talentSearchEnabled'>
>;

/** The words shown in the activity log for each switch. */
const SETTING_LABEL: Record<keyof PlatformSettingsInput, string> = {
  autoApproveCompanies: 'Auto-approve companies',
  messagingEnabled: 'Messaging',
  talentSearchEnabled: 'Find workers',
};

/** The settings as the apps see them (matches `PlatformSettings`). */
const toDto = (settings: PlatformSettings) => ({
  autoApproveCompanies: settings.autoApproveCompanies,
  messagingEnabled: settings.messagingEnabled,
  talentSearchEnabled: settings.talentSearchEnabled,
});

/** There is one settings row (id 1). It is created with the defaults the first time. */
async function current() {
  return prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export async function getPlatformSettings() {
  return toDto(await current());
}

/** Admin turns switches on or off. Every real change is written to the activity log. */
export async function updatePlatformSettings(adminId: string, changes: PlatformSettingsInput) {
  const before = await current();
  const changed = (Object.keys(SETTING_LABEL) as (keyof PlatformSettingsInput)[]).filter(
    (key) => changes[key] !== undefined && changes[key] !== before[key],
  );
  if (changed.length === 0) return toDto(before);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.platformSettings.update({ where: { id: 1 }, data: changes });
    for (const key of changed) {
      await recordAudit(
        {
          actorId: adminId,
          action: row[key] ? 'settings.on' : 'settings.off',
          targetType: 'settings',
          targetId: key,
          details: { setting: SETTING_LABEL[key] },
        },
        tx,
      );
    }
    return row;
  });
  return toDto(updated);
}
