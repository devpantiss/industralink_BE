import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { type Prisma, PrismaClient } from '../generated/prisma/client.js';

/** The one shared database client. Import `prisma` from here, never create another. */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** Either the normal client or the client inside prisma.$transaction(...). */
export type Db = typeof prisma | Prisma.TransactionClient;
