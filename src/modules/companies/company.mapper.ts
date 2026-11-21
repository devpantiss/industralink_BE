import type { Company, CompanyDocument } from '../../generated/prisma/client.js';
import { toNationalPhone } from '../../lib/phone.js';
import { fileUrl, optionalFileUrl } from '../files/storage.js';

const orUndefined = <T>(value: T | null) => value ?? undefined;

/** The company as the apps see it (matches `Company` in the dashboard types). */
export function toCompanyDto(company: Company) {
  return {
    id: company.id,
    name: company.name,
    sector: orUndefined(company.sector),
    size: orUndefined(company.size),
    location: { city: company.city ?? '', state: company.state ?? '' },
    address: orUndefined(company.address),
    pincode: orUndefined(company.pincode),
    website: orUndefined(company.website),
    gstNumber: orUndefined(company.gstNumber),
    about: orUndefined(company.about),
    hrName: orUndefined(company.hrName),
    hrDesignation: orUndefined(company.hrDesignation),
    hrPhone: toNationalPhone(company.hrPhone),
    sites: company.sites,
    hiringType: orUndefined(company.hiringType),
    logoUrl: optionalFileUrl(company.logoKey, 24 * 60),
    verification: company.verification,
    rejectionReason: orUndefined(company.rejectionReason),
    status: company.status,
    createdAt: company.createdAt.toISOString(),
  };
}

/** A verification document as the apps see it (matches `CompanyDocument`). */
export function toCompanyDocumentDto(doc: CompanyDocument) {
  return {
    id: doc.id,
    companyId: doc.companyId,
    name: doc.name,
    type: doc.type,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    uploadedAt: doc.createdAt.toISOString(),
    url: fileUrl(doc.storageKey),
  };
}
