import type { Prisma } from '../generated/prisma/client.js';
import type { prisma } from './prisma.js';

/** Either the normal client or the client inside prisma.$transaction(...). */
export type Db = typeof prisma | Prisma.TransactionClient;
