/**
 * Empty app, no demo data: npm run db:clear
 * Deletes all data and uploaded files on this computer and keeps the tables.
 * Make an admin afterwards with npm run admin:create.
 */
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { assertLocalDatabase, wipe } from './local-data.js';

assertLocalDatabase();
await wipe();
console.warn('All data and uploaded files are deleted. The tables are empty.');
await prisma.$disconnect();
