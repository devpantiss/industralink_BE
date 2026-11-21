import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { notFound } from '../../lib/errors.js';
import { openJobsOfCompany } from '../jobs/job-search.service.js';
import { openJobWhere, visibleCompanyWhere } from '../jobs/job.queries.js';
import { toPublicCompanyDto } from './company.mapper.js';

export interface CompanyDirectoryFilters {
  q?: string;
  sector?: string;
}

/** Verified companies for workers to browse, the ones hiring most first. */
export async function listCompanies({ q, sector }: CompanyDirectoryFilters) {
  const where: Prisma.CompanyWhereInput = { ...visibleCompanyWhere, sector };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { sector: { contains: q, mode: 'insensitive' } },
    ];
  }

  const companies = await prisma.company.findMany({ where, orderBy: { name: 'asc' } });
  const openJobs = await prisma.job.groupBy({
    by: ['companyId'],
    where: { ...openJobWhere(), companyId: { in: companies.map((company) => company.id) } },
    _count: { _all: true },
  });
  const counts = new Map(openJobs.map((row) => [row.companyId, row._count._all]));

  return companies
    .map((company) => ({ company: toPublicCompanyDto(company), openJobs: counts.get(company.id) ?? 0 }))
    .sort((a, b) => b.openJobs - a.openJobs);
}

/** Company page: the company and its open jobs (matches `CompanyForWorker`). */
export async function getCompanyForWorker(companyId: string, workerId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId, ...visibleCompanyWhere } });
  if (!company) throw notFound('Company not found.');
  return { company: toPublicCompanyDto(company), jobs: await openJobsOfCompany(company.id, workerId) };
}
