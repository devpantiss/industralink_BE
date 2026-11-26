import { prisma } from '../../db/prisma.js';
import type { SupportTicket, User } from '../../generated/prisma/client.js';
import { invalid, notFound } from '../../lib/errors.js';
import { toNationalPhone } from '../../lib/phone.js';
import { recordAudit } from '../admin/audit.service.js';
import { addNotifications, pushNotifications } from '../notifications/notification.service.js';
import type { SupportRequestInput } from './support.schemas.js';

/** How the team can reply to a logged-in user. */
const contactOf = (user: User) => (user.phone ? `+91 ${toNationalPhone(user.phone)}` : (user.email ?? ''));

/** Help form → a ticket the admin team sees under Reports & help. */
export async function createTicket(user: User | undefined, input: SupportRequestInput) {
  const contact = user ? contactOf(user) : input.contact;
  if (!contact) throw invalid('Give a phone number or email so we can reply.');

  await prisma.supportTicket.create({
    data: {
      userId: user?.id ?? null,
      name: user?.name ?? input.name ?? 'Guest',
      contact,
      role: user?.role ?? 'guest',
      topic: input.topic,
      message: input.message,
    },
  });
}

/** A ticket as the apps see it (matches `SupportTicket`). */
function toTicketDto(ticket: SupportTicket) {
  return {
    id: ticket.id,
    userId: ticket.userId ?? undefined,
    name: ticket.name,
    contact: ticket.contact,
    role: ticket.role,
    topic: ticket.topic,
    message: ticket.message,
    at: ticket.createdAt.toISOString(),
    status: ticket.status,
  };
}

export async function listTickets(status: 'open' | 'closed' | 'all') {
  const tickets = await prisma.supportTicket.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return tickets.map(toTicketDto);
}

/** Admin marks a help request as handled. The person is told if they have an account. */
export async function closeTicket(adminId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound('Request not found.');
  if (ticket.status === 'closed') return;

  const notices = ticket.userId
    ? [
        {
          userId: ticket.userId,
          title: 'Your help request was answered',
          body: `About "${ticket.topic}". Our team has handled it.`,
        },
      ]
    : [];
  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'closed', closedAt: new Date() },
    });
    await addNotifications(notices, tx);
    await recordAudit(
      { actorId: adminId, action: 'support.close', targetType: 'ticket', targetId: ticket.id },
      tx,
    );
  });
  pushNotifications(notices);
}
