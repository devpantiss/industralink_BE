import { z } from 'zod';
import { COMPANY_DOC_TYPES, HIRING_TYPES, SECTORS } from '../../lib/catalog.js';
import {
  optionalChoice,
  optionalLocation,
  optionalPhone,
  optionalPincode,
  optionalText,
  textList,
} from '../../lib/validation.js';

/** GSTIN: 15 characters, e.g. 21AAACK0000A1Z5. */
const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * PATCH /employer/company. Only the fields sent are changed.
 * verification, status and rejectionReason are set by admins, so they are ignored here.
 */
export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name.').max(120).optional(),
  sector: z.enum(SECTORS, 'Choose an industry.').optional(),
  size: optionalText(30),
  location: optionalLocation,
  address: optionalText(300),
  pincode: optionalPincode,
  website: optionalText(200),
  gstNumber: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value),
      z.string().regex(GST_PATTERN, 'Enter a valid 15-character GST number.').nullable(),
    )
    .optional(),
  about: optionalText(2000),
  hrName: optionalText(80),
  hrDesignation: optionalText(80),
  hrPhone: optionalPhone,
  sites: textList(20, 80),
  hiringType: optionalChoice(HIRING_TYPES),
  /** New logo as a data URL, or null / "" to remove it. An unchanged link is ignored. */
  logoUrl: z.string().nullable().optional(),
  /** After a rejection: send the company back to the admin for review. */
  resubmit: z.boolean().optional(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const uploadCompanyDocumentSchema = z.object({
  type: z.enum(COMPANY_DOC_TYPES, 'Choose what kind of document this is.').default('gst'),
});
