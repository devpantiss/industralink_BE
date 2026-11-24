import { prisma } from '../../db/prisma.js';

/** The newest entries shown on Admin → Activity log. */
const LIST_LIMIT = 100;

/** Machine action → words the admin reads. */
const ACTION_LABEL: Record<string, string> = {
  'company.approve': 'Approved company',
  'company.reject': 'Rejected company',
  'user.block': 'Blocked user',
  'user.unblock': 'Unblocked user',
  'user.delete': 'Deleted own account',
  'job.remove': 'Removed job',
  'report.dismiss': 'Dismissed report',
  'support.close': 'Closed help request',
  'settings.on': 'Turned on setting',
  'settings.off': 'Turned off setting',
};

const ids = (rows: { targetType: string; targetId: string }[], type: string) => [
  ...new Set(rows.filter((row) => row.targetType === type).map((row) => row.targetId)),
];

/** Looks up the names of everything the entries point at, a few queries in total. */
async function targetNames(rows: { targetType: string; targetId: string }[]) {
  const [companies, users, jobs, tickets] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: ids(rows, 'company') } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({ where: { id: { in: ids(rows, 'user') } }, select: { id: true, name: true } }),
    prisma.job.findMany({
      where: { id: { in: ids(rows, 'job') } },
      select: { id: true, title: true, company: { select: { name: true } } },
    }),
    prisma.supportTicket.findMany({
      where: { id: { in: ids(rows, 'ticket') } },
      select: { id: true, topic: true, name: true },
    }),
  ]);
  return new Map<string, string>([
    ...companies.map((c) => [c.id, c.name] as const),
    ...users.map((u) => [u.id, u.name] as const),
    ...jobs.map((j) => [j.id, `${j.title} (${j.company.name})`] as const),
    ...tickets.map((t) => [t.id, `${t.topic} (${t.name})`] as const),
  ]);
}

/** Admin → Activity log (matches `AuditEntry`), newest first. */
export async function listActivity() {
  const rows = await prisma.auditLog.findMany({
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  const names = await targetNames(rows);

  return rows.map((row) => {
    const details = (row.details ?? {}) as { reason?: string; setting?: string };
    const name =
      row.targetType === 'settings' ? (details.setting ?? 'Platform setting') : names.get(row.targetId);
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      actor: row.actor?.name ?? 'Deleted user',
      action: ACTION_LABEL[row.action] ?? row.action,
      target: [name ?? 'Removed item', details.reason].filter(Boolean).join(' – '),
    };
  });
}
